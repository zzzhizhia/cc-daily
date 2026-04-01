import { homedir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, readFile, readdir, access } from 'fs/promises';

export interface ReportFrontmatter {
  date: string;
  generated: string;
  sessions: number;
  projects: string[];
  prompts: number;
  focus: string;
  activeHours: string;
}

export interface Report {
  frontmatter: ReportFrontmatter;
  body: string;
}

/** Returns the reports directory path: ~/.ccreport/reports/ */
export function getReportsDir(): string {
  return join(homedir(), '.ccreport', 'reports');
}

function reportPath(date: string): string {
  return join(getReportsDir(), `${date}.md`);
}

// --- Simple YAML frontmatter serializer/deserializer ---

function serializeFrontmatter(fm: ReportFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`date: ${fm.date}`);
  lines.push(`generated: ${fm.generated}`);
  lines.push(`sessions: ${fm.sessions}`);
  lines.push('projects:');
  for (const p of fm.projects) {
    lines.push(`  - ${p}`);
  }
  lines.push(`prompts: ${fm.prompts}`);
  lines.push(`focus: "${fm.focus}"`);
  lines.push(`activeHours: "${fm.activeHours}"`);
  lines.push('---');
  return lines.join('\n');
}

function parseFrontmatter(raw: string): { frontmatter: ReportFrontmatter; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1];
  const body = match[2];

  const fm: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  let currentArray: string[] = [];

  for (const line of yamlBlock.split('\n')) {
    // Array item: "  - value"
    if (/^\s+-\s+/.test(line) && currentArrayKey) {
      currentArray.push(line.replace(/^\s+-\s+/, ''));
      continue;
    }

    // Flush pending array
    if (currentArrayKey) {
      fm[currentArrayKey] = currentArray;
      currentArrayKey = null;
      currentArray = [];
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, value] = kvMatch;

    // Empty value means next lines are array items
    if (value === '') {
      currentArrayKey = key;
      currentArray = [];
      continue;
    }

    // Strip surrounding quotes
    const unquoted = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    fm[key] = unquoted;
  }

  // Flush final pending array
  if (currentArrayKey) {
    fm[currentArrayKey] = currentArray;
  }

  return {
    frontmatter: {
      date: String(fm.date ?? ''),
      generated: String(fm.generated ?? ''),
      sessions: Number(fm.sessions ?? 0),
      projects: Array.isArray(fm.projects) ? fm.projects : [],
      prompts: Number(fm.prompts ?? 0),
      focus: String(fm.focus ?? ''),
      activeHours: String(fm.activeHours ?? ''),
    },
    body,
  };
}

/** Save a report to disk */
export async function save(date: string, frontmatter: ReportFrontmatter, body: string): Promise<void> {
  const dir = getReportsDir();
  try {
    await mkdir(dir, { recursive: true });
    const content = serializeFrontmatter(frontmatter) + '\n' + body;
    await writeFile(reportPath(date), content, 'utf-8');
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOSPC') {
      throw new Error('Disk full: unable to save report');
    }
    throw err;
  }
}

/** Load a report by date, returns null if not found */
export async function load(date: string): Promise<Report | null> {
  try {
    const content = await readFile(reportPath(date), 'utf-8');
    return parseFrontmatter(content);
  } catch {
    return null;
  }
}

/** List all reports, sorted by date descending */
export async function list(): Promise<Report[]> {
  const dir = getReportsDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  const reports: Report[] = [];
  for (const file of mdFiles) {
    const date = file.replace('.md', '');
    const report = await load(date);
    if (report) {
      reports.push(report);
    }
  }
  return reports;
}

/** Check if a report exists for the given date */
export async function exists(date: string): Promise<boolean> {
  try {
    await access(reportPath(date));
    return true;
  } catch {
    return false;
  }
}
