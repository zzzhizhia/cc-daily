import { describe, it, expect } from 'vitest';
import {
  generateHeader,
  formatPrompt,
  formatProjectPrompt,
  mergeResults,
} from '../formatter.js';
import type { ProjectData, Metadata } from '../extractor.js';

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    totalSessions: 5,
    totalProjects: 2,
    totalUserMessages: 42,
    focus: { project: '/Users/x/Developer/myorg/myrepo', percentage: 60 },
    activeHours: '10:00-12:00, 14:00-18:00',
    timestamps: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    path: '~/Developer/myorg/myrepo',
    originalPath: '/Users/x/Developer/myorg/myrepo',
    sessions: [
      {
        sessionId: 's1',
        messages: [
          { role: 'user', text: 'implement auth' },
          { role: 'assistant', text: 'Done implementing auth module.' },
        ],
      },
    ],
    worktrees: [],
    ...overrides,
  };
}

// --- generateHeader ---

describe('generateHeader', () => {
  it('generates tweetable line with correct format', () => {
    const header = generateHeader(makeMetadata(), '2026-03-27');
    const lines = header.split('\n');
    // First line is the tweetable line
    expect(lines[0]).toContain('3/27');
    expect(lines[0]).toContain('2 projects');
    expect(lines[0]).toContain('5 sessions');
    expect(lines[0]).toContain('myorg/myrepo');
  });

  it('generates markdown table with correct stats', () => {
    const header = generateHeader(makeMetadata(), '2026-03-27');
    expect(header).toContain('| Projects | 2 |');
    expect(header).toContain('| Sessions | 5 |');
    expect(header).toContain('| Messages | 42 |');
    expect(header).toContain('| Active hours | 10:00-12:00, 14:00-18:00 |');
    expect(header).toContain('myorg/myrepo (60%)');
  });

  it('uses short name (last 2 segments) for focus project', () => {
    const meta = makeMetadata({
      focus: { project: '/a/b/c/d/reponame', percentage: 80 },
    });
    const header = generateHeader(meta, '2026-01-05');
    expect(header).toContain('d/reponame');
    // Month/day without leading zero
    expect(header).toContain('1/5');
  });
});

// --- formatPrompt ---

describe('formatPrompt', () => {
  it('includes metadata context line', () => {
    const projects = [makeProject()];
    const meta = makeMetadata();
    const prompt = formatPrompt(projects, meta);

    expect(prompt).toContain('2 projects');
    expect(prompt).toContain('5 sessions');
    expect(prompt).toContain('42 messages');
  });

  it('includes system instruction', () => {
    const prompt = formatPrompt([makeProject()], makeMetadata());
    expect(prompt).toContain('senior engineer');
    expect(prompt).toContain('standup');
  });

  it('includes project section with messages', () => {
    const prompt = formatPrompt([makeProject()], makeMetadata());
    expect(prompt).toContain('## ~/Developer/myorg/myrepo');
    // Only user messages are included (as blockquote), assistant messages are excluded
    expect(prompt).toContain('> implement auth');
    expect(prompt).not.toContain('[assistant]');
  });

  it('includes worktree sections', () => {
    const project = makeProject({
      worktrees: [
        {
          name: 'feature-x',
          sessions: [
            {
              sessionId: 'ws1',
              messages: [{ role: 'user', text: 'worktree msg' }],
            },
          ],
        },
      ],
    });
    const prompt = formatPrompt([project], makeMetadata());
    expect(prompt).toContain('### Worktree: feature-x');
    expect(prompt).toContain('> worktree msg');
  });
});

// --- formatProjectPrompt ---

describe('formatProjectPrompt', () => {
  it('includes project path heading', () => {
    const prompt = formatProjectPrompt(makeProject());
    expect(prompt).toContain('## ~/Developer/myorg/myrepo');
  });

  it('includes system instruction', () => {
    const prompt = formatProjectPrompt(makeProject());
    expect(prompt).toContain('senior engineer');
    expect(prompt).toContain('bullet points');
  });

  it('includes messages', () => {
    const prompt = formatProjectPrompt(makeProject());
    expect(prompt).toContain('> implement auth');
  });
});

// --- mergeResults ---

describe('mergeResults', () => {
  it('prepends header to results', () => {
    const header = '# Header Line';
    const results = ['## Alpha\nContent A', '## Beta\nContent B'];
    const merged = mergeResults(header, results);

    expect(merged.startsWith('# Header Line')).toBe(true);
    expect(merged).toContain('## Alpha');
    expect(merged).toContain('## Beta');
  });

  it('sorts results by project heading alphabetically', () => {
    const header = 'Header';
    const results = [
      '## ~/z-project\nLast',
      '## ~/a-project\nFirst',
      '## ~/m-project\nMiddle',
    ];
    const merged = mergeResults(header, results);

    const aIdx = merged.indexOf('## ~/a-project');
    const mIdx = merged.indexOf('## ~/m-project');
    const zIdx = merged.indexOf('## ~/z-project');

    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  it('handles single result', () => {
    const merged = mergeResults('Header', ['## Only\nSingle']);
    expect(merged).toBe('Header\n\n## Only\nSingle');
  });

  it('handles empty results', () => {
    const merged = mergeResults('Header', []);
    expect(merged).toBe('Header\n\n');
  });
});
