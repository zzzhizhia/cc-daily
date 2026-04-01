import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock os.homedir so claude paths point to our temp dir
let fakeHome: string;
let tmpBase: string;

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return {
    ...original,
    homedir: () => fakeHome,
  };
});

const {
  streamHistoryByDate,
  extractSessionText,
  extract,
  FileNotFoundError,
} = await import('../extractor.js');

// Helpers

function jsonl(...objs: unknown[]): string {
  return objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

/** Create a history.jsonl entry */
function historyEntry(
  sessionId: string,
  project: string,
  timestamp: number,
): object {
  return { sessionId, project, timestamp };
}

/** Create a user session JSONL entry */
function userEntry(content: string, timestamp?: string): object {
  return {
    type: 'user',
    message: { content },
    ...(timestamp ? { timestamp } : {}),
  };
}

/** Create an assistant session JSONL entry with text blocks */
function assistantEntry(texts: string[]): object {
  return {
    type: 'assistant',
    message: {
      content: texts.map((t) => ({ type: 'text', text: t })),
    },
  };
}

/** Create an assistant entry with mixed content (text + tool_use + thinking) */
function assistantMixedEntry(): object {
  return {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'response text' },
        { type: 'tool_use', id: 'tool1', name: 'read', input: {} },
        { type: 'thinking', thinking: 'I am thinking...' },
        { type: 'text', text: 'more text' },
      ],
    },
  };
}

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), 'cc-daily-ext-'));
  fakeHome = tmpBase;
  // Create .claude directory structure
  await mkdir(join(fakeHome, '.claude'), { recursive: true });
  await mkdir(join(fakeHome, '.claude', 'projects'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

// --- streamHistoryByDate ---

describe('streamHistoryByDate', () => {
  it('filters entries by date', async () => {
    const date = '2026-03-27';
    // Timestamps within 2026-03-27 local time
    const inRange = new Date(2026, 2, 27, 14, 0, 0).getTime();
    const outOfRange = new Date(2026, 2, 26, 14, 0, 0).getTime();

    const content = jsonl(
      historyEntry('s1', '/proj/a', inRange),
      historyEntry('s2', '/proj/b', outOfRange),
      historyEntry('s3', '/proj/c', inRange),
    );

    await writeFile(join(fakeHome, '.claude', 'history.jsonl'), content);

    const pairs = await streamHistoryByDate(date);
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.sessionId)).toEqual(['s1', 's3']);
  });

  it('skips empty lines', async () => {
    const ts = new Date(2026, 2, 27, 10, 0).getTime();
    const content =
      '\n' + JSON.stringify(historyEntry('s1', '/proj', ts)) + '\n\n';

    await writeFile(join(fakeHome, '.claude', 'history.jsonl'), content);

    const pairs = await streamHistoryByDate('2026-03-27');
    expect(pairs).toHaveLength(1);
  });

  it('skips malformed JSON lines', async () => {
    const ts = new Date(2026, 2, 27, 10, 0).getTime();
    const content =
      'not valid json\n' +
      JSON.stringify(historyEntry('s1', '/proj', ts)) +
      '\n' +
      '{broken\n';

    await writeFile(join(fakeHome, '.claude', 'history.jsonl'), content);

    const pairs = await streamHistoryByDate('2026-03-27');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sessionId).toBe('s1');
  });

  it('deduplicates same sessionId+project', async () => {
    const ts1 = new Date(2026, 2, 27, 10, 0).getTime();
    const ts2 = new Date(2026, 2, 27, 11, 0).getTime();
    const content = jsonl(
      historyEntry('s1', '/proj', ts1),
      historyEntry('s1', '/proj', ts2),
    );

    await writeFile(join(fakeHome, '.claude', 'history.jsonl'), content);

    const pairs = await streamHistoryByDate('2026-03-27');
    expect(pairs).toHaveLength(1);
  });

  it('skips entries missing required fields', async () => {
    const ts = new Date(2026, 2, 27, 10, 0).getTime();
    const content = jsonl(
      { sessionId: 's1', project: '/proj' }, // missing timestamp
      { sessionId: 's2', timestamp: ts }, // missing project
      { project: '/proj', timestamp: ts }, // missing sessionId
      historyEntry('s3', '/proj', ts), // valid
    );

    await writeFile(join(fakeHome, '.claude', 'history.jsonl'), content);

    const pairs = await streamHistoryByDate('2026-03-27');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sessionId).toBe('s3');
  });
});

// --- extractSessionText ---

describe('extractSessionText', () => {
  async function writeSession(
    project: string,
    sessionId: string,
    content: string,
  ): Promise<void> {
    const encoded = project.replace(/\//g, '-');
    const dir = join(fakeHome, '.claude', 'projects', encoded);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${sessionId}.jsonl`), content);
  }

  it('extracts user content as string', async () => {
    const content = jsonl(
      userEntry('Hello world', '2026-03-27T10:00:00Z'),
    );
    await writeSession('/proj/a', 'sess1', content);

    const result = await extractSessionText('sess1', '/proj/a');
    expect(result.sessionId).toBe('sess1');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].text).toBe('Hello world');
    expect(result.messages[0].timestamp).toBeDefined();
  });

  it('extracts assistant text blocks from array content', async () => {
    const content = jsonl(assistantEntry(['part1', 'part2']));
    await writeSession('/proj/a', 'sess1', content);

    const result = await extractSessionText('sess1', '/proj/a');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].text).toBe('part1\npart2');
  });

  it('filters out non-text blocks from assistant content', async () => {
    const content = jsonl(assistantMixedEntry());
    await writeSession('/proj/a', 'sess1', content);

    const result = await extractSessionText('sess1', '/proj/a');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('response text\nmore text');
  });

  it('skips empty lines and malformed JSON', async () => {
    const content =
      '\n' +
      JSON.stringify(userEntry('valid')) +
      '\n' +
      'broken json\n' +
      '\n';
    await writeSession('/proj/a', 'sess1', content);

    const result = await extractSessionText('sess1', '/proj/a');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('valid');
  });

  it('throws FileNotFoundError for missing session file', async () => {
    await expect(
      extractSessionText('nonexistent', '/proj/a'),
    ).rejects.toThrow(FileNotFoundError);
  });

  it('skips non-user/assistant entry types', async () => {
    const content = jsonl(
      { type: 'system', message: { content: 'system msg' } },
      { type: 'progress', message: {} },
      userEntry('user msg'),
    );
    await writeSession('/proj/a', 'sess1', content);

    const result = await extractSessionText('sess1', '/proj/a');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('user msg');
  });
});

// --- extract (integration-ish) ---

describe('extract', () => {
  async function setupProject(
    project: string,
    sessionId: string,
    historyTs: number,
    sessionContent: string,
  ): Promise<void> {
    const encoded = project.replace(/\//g, '-');
    const dir = join(fakeHome, '.claude', 'projects', encoded);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${sessionId}.jsonl`), sessionContent);

    // Append to history
    const historyPath = join(fakeHome, '.claude', 'history.jsonl');
    let existing = '';
    try {
      const { readFile } = await import('fs/promises');
      existing = await readFile(historyPath, 'utf-8');
    } catch {
      // file doesn't exist yet
    }
    await writeFile(
      historyPath,
      existing + JSON.stringify(historyEntry(sessionId, project, historyTs)) + '\n',
    );
  }

  it('groups worktree sessions under parent project', async () => {
    const ts = new Date(2026, 2, 27, 14, 0).getTime();
    const parentProject = '/Users/x/dev/app';
    const worktreeProject = '/Users/x/dev/app/.claude/worktrees/feature-branch';

    await setupProject(
      parentProject,
      'main-sess',
      ts,
      jsonl(userEntry('main work', '2026-03-27T14:00:00Z')),
    );
    await setupProject(
      worktreeProject,
      'wt-sess',
      ts,
      jsonl(userEntry('worktree work', '2026-03-27T14:30:00Z')),
    );

    const result = await extract('2026-03-27');

    // Should have 1 project (parent) with worktree merged in
    expect(result.projects).toHaveLength(1);
    const proj = result.projects[0];
    expect(proj.sessions).toHaveLength(1);
    expect(proj.worktrees).toHaveLength(1);
    expect(proj.worktrees[0].name).toBe('feature-branch');
    expect(proj.worktrees[0].sessions).toHaveLength(1);
  });

  it('skips missing session files with warning', async () => {
    const ts = new Date(2026, 2, 27, 14, 0).getTime();

    // Write history entry but NOT the session file
    const historyPath = join(fakeHome, '.claude', 'history.jsonl');
    await writeFile(
      historyPath,
      JSON.stringify(historyEntry('missing-sess', '/proj/missing', ts)) + '\n',
    );

    const warnings: string[] = [];
    const result = await extract('2026-03-27', (step) => {
      if (step.type === 'error') warnings.push(step.message);
    });

    expect(result.projects).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('not found');
  });

  it('computes metadata correctly', async () => {
    const ts1 = new Date(2026, 2, 27, 10, 0).getTime();
    const ts2 = new Date(2026, 2, 27, 14, 0).getTime();

    await setupProject(
      '/proj/a',
      'sess1',
      ts1,
      jsonl(
        userEntry('msg1', '2026-03-27T10:00:00Z'),
        userEntry('msg2', '2026-03-27T10:30:00Z'),
      ),
    );
    await setupProject(
      '/proj/b',
      'sess2',
      ts2,
      jsonl(userEntry('msg3', '2026-03-27T14:00:00Z')),
    );

    const result = await extract('2026-03-27');

    expect(result.metadata.totalSessions).toBe(2);
    expect(result.metadata.totalProjects).toBe(2);
    expect(result.metadata.totalUserMessages).toBe(3);
    // Focus should be /proj/a since it has 1 session same as /proj/b but gets picked first
    expect(result.metadata.focus.percentage).toBe(50);
    expect(result.metadata.activeHours).not.toBe('');
  });
});
