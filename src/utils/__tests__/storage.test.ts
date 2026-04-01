import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ReportFrontmatter } from '../storage.js';

// We mock os.homedir so that getReportsDir() returns <tmpDir>/.ccreport/reports
// (since getReportsDir = join(homedir(), '.ccreport', 'reports'))
let fakeHome: string;
let tmpBase: string;

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return {
    ...original,
    homedir: () => fakeHome,
  };
});

// Import after mock so the mock is wired in
const { save, load, list, exists, getReportsDir } = await import('../storage.js');

function makeFrontmatter(overrides: Partial<ReportFrontmatter> = {}): ReportFrontmatter {
  return {
    date: '2026-03-27',
    generated: '2026-03-27T20:00:00Z',
    sessions: 3,
    projects: ['/Users/x/dev/app', '/Users/x/dev/lib'],
    prompts: 42,
    focus: 'Implemented auth module',
    activeHours: '14:00-18:00',
    ...overrides,
  };
}

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), 'ccreport-test-'));
  fakeHome = tmpBase;
});

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true });
});

describe('save + load roundtrip', () => {
  it('preserves all frontmatter fields and body', async () => {
    const fm = makeFrontmatter();
    const body = '## Summary\n\nDid some coding today.\n';

    await save('2026-03-27', fm, body);
    const report = await load('2026-03-27');

    expect(report).not.toBeNull();
    expect(report!.frontmatter.date).toBe(fm.date);
    expect(report!.frontmatter.generated).toBe(fm.generated);
    expect(report!.frontmatter.sessions).toBe(fm.sessions);
    expect(report!.frontmatter.projects).toEqual(fm.projects);
    expect(report!.frontmatter.prompts).toBe(fm.prompts);
    expect(report!.frontmatter.focus).toBe(fm.focus);
    expect(report!.frontmatter.activeHours).toBe(fm.activeHours);
    expect(report!.body).toBe(body);
  });

  it('handles empty body', async () => {
    const fm = makeFrontmatter();
    await save('2026-03-27', fm, '');
    const report = await load('2026-03-27');

    expect(report).not.toBeNull();
    expect(report!.body).toBe('');
  });

  it('handles empty projects array', async () => {
    const fm = makeFrontmatter({ projects: [] });
    await save('2026-03-27', fm, 'body');
    const report = await load('2026-03-27');

    expect(report).not.toBeNull();
    expect(report!.frontmatter.projects).toEqual([]);
  });
});

describe('list', () => {
  it('returns reports sorted by date descending', async () => {
    await save('2026-03-25', makeFrontmatter({ date: '2026-03-25' }), 'day 25');
    await save('2026-03-27', makeFrontmatter({ date: '2026-03-27' }), 'day 27');
    await save('2026-03-26', makeFrontmatter({ date: '2026-03-26' }), 'day 26');

    const reports = await list();
    expect(reports).toHaveLength(3);
    expect(reports[0].frontmatter.date).toBe('2026-03-27');
    expect(reports[1].frontmatter.date).toBe('2026-03-26');
    expect(reports[2].frontmatter.date).toBe('2026-03-25');
  });

  it('returns empty array when reports directory does not exist', async () => {
    // fakeHome already points to a fresh tmp dir but save hasn't been called,
    // so .ccreport/reports doesn't exist yet
    const reports = await list();
    expect(reports).toEqual([]);
  });

  it('ignores non-matching files', async () => {
    await save('2026-03-27', makeFrontmatter(), 'body');
    const reportsDir = getReportsDir();
    await writeFile(join(reportsDir, 'notes.txt'), 'hello');

    const reports = await list();
    expect(reports).toHaveLength(1);
  });
});

describe('exists', () => {
  it('returns true when file exists', async () => {
    await save('2026-03-27', makeFrontmatter(), 'body');
    expect(await exists('2026-03-27')).toBe(true);
  });

  it('returns false when file does not exist', async () => {
    expect(await exists('2026-03-27')).toBe(false);
  });
});

describe('load with malformed content', () => {
  it('returns null for file without frontmatter', async () => {
    const reportsDir = getReportsDir();
    await mkdir(reportsDir, { recursive: true });
    await writeFile(join(reportsDir, '2026-03-27.md'), 'Just plain text, no frontmatter.');
    const report = await load('2026-03-27');
    expect(report).toBeNull();
  });

  it('returns null for file with incomplete frontmatter delimiters', async () => {
    const reportsDir = getReportsDir();
    await mkdir(reportsDir, { recursive: true });
    await writeFile(join(reportsDir, '2026-03-27.md'), '---\ndate: 2026-03-27\nNo closing delimiter');
    const report = await load('2026-03-27');
    expect(report).toBeNull();
  });

  it('returns null for nonexistent date', async () => {
    const report = await load('9999-12-31');
    expect(report).toBeNull();
  });
});

describe('save creates directory if not exists', () => {
  it('creates nested directory structure (mkdirp)', async () => {
    // The .ccreport/reports dir doesn't exist yet in the fresh tmp home
    expect(await exists('2026-03-27')).toBe(false);
    await save('2026-03-27', makeFrontmatter(), 'body');
    const report = await load('2026-03-27');
    expect(report).not.toBeNull();
    expect(report!.frontmatter.date).toBe('2026-03-27');
  });
});
