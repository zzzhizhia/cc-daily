import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { homedir } from 'os';
import { isDateInRange, getActiveHours } from '../utils/date.js';
import { encodePath, displayPath, parseWorktree } from '../utils/paths.js';

// --- Types ---

export interface SessionMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: number;
}

export interface SessionData {
  sessionId: string;
  messages: SessionMessage[];
}

export interface WorktreeData {
  name: string;
  sessions: SessionData[];
}

export interface ProjectData {
  path: string;         // display path (~/Developer/...)
  originalPath: string; // original path for encoding
  sessions: SessionData[];
  worktrees: WorktreeData[];
}

export interface Metadata {
  totalSessions: number;
  totalProjects: number;
  totalUserMessages: number;
  focus: { project: string; percentage: number };
  activeHours: string;
  timestamps: number[];
}

export interface ProgressStep {
  type: 'scanned' | 'extracted' | 'summarizing' | 'done' | 'error';
  message: string;
  sessions?: number;
  projects?: number;
  messages?: number;
}

export interface ExtractionResult {
  projects: ProjectData[];
  metadata: Metadata;
}

// --- Constants ---

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TRUNCATE_ENTRIES = 500;

// --- 3.1 streamHistoryByDate ---

interface SessionPair {
  sessionId: string;
  project: string;
}

export async function streamHistoryByDate(date: string): Promise<SessionPair[]> {
  const historyPath = join(homedir(), '.claude', 'history.jsonl');
  const seen = new Set<string>();
  const pairs: SessionPair[] = [];

  const rl = createInterface({
    input: createReadStream(historyPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry: { timestamp?: number; sessionId?: string; project?: string };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!entry.timestamp || !entry.sessionId || !entry.project) continue;
    if (!isDateInRange(entry.timestamp, date)) continue;

    const key = `${entry.sessionId}:${entry.project}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push({ sessionId: entry.sessionId, project: entry.project });
  }

  return pairs;
}

// --- 3.2 extractSessionText ---

export async function extractSessionText(
  sessionId: string,
  project: string,
): Promise<SessionData> {
  const encoded = encodePath(project);
  const sessionPath = join(
    homedir(),
    '.claude',
    'projects',
    encoded,
    `${sessionId}.jsonl`,
  );

  const messages: SessionMessage[] = [];

  // Check file size for truncation
  let truncate = false;
  try {
    const info = await stat(sessionPath);
    if (info.size > MAX_FILE_SIZE) {
      truncate = true;
    }
  } catch {
    // File not found or inaccessible — will be caught when creating the stream
    throw new FileNotFoundError(sessionPath);
  }

  const rl = createInterface({
    input: createReadStream(sessionPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let entryCount = 0;

  for await (const line of rl) {
    if (truncate && entryCount >= TRUNCATE_ENTRIES) {
      rl.close();
      break;
    }

    if (!line.trim()) continue;

    let entry: {
      type?: string;
      message?: { content?: unknown };
      timestamp?: string;
    };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    entryCount++;

    if (entry.type === 'user') {
      const content = entry.message?.content;
      if (typeof content === 'string' && content.length > 0) {
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : undefined;
        messages.push({ role: 'user', text: content, timestamp: ts });
      }
    } else if (entry.type === 'assistant') {
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        const textParts: string[] = [];
        for (const item of content) {
          if (
            item &&
            typeof item === 'object' &&
            'type' in item &&
            item.type === 'text' &&
            'text' in item &&
            typeof item.text === 'string'
          ) {
            textParts.push(item.text);
          }
        }
        if (textParts.length > 0) {
          messages.push({ role: 'assistant', text: textParts.join('\n') });
        }
      }
    }
    // Skip all other types: progress, file-history-snapshot, queue-operation, system
  }

  return { sessionId, messages };
}

// --- Custom error for missing files ---

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`Session file not found: ${path}`);
    this.name = 'FileNotFoundError';
  }
}

// --- 3.3 extract ---

export async function extract(
  date: string,
  onProgress?: (step: ProgressStep) => void,
): Promise<ExtractionResult> {
  // Step 1: Scan history
  const pairs = await streamHistoryByDate(date);
  const uniqueProjects = new Set(pairs.map(p => p.project));

  onProgress?.({
    type: 'scanned',
    message: `Scanned history.jsonl — ${pairs.length} sessions, ${uniqueProjects.size} projects`,
    sessions: pairs.length,
    projects: uniqueProjects.size,
  });

  // Step 2: Extract session data
  const sessionResults: { pair: SessionPair; data: SessionData }[] = [];

  for (const pair of pairs) {
    try {
      const data = await extractSessionText(pair.sessionId, pair.project);
      sessionResults.push({ pair, data });
    } catch (err) {
      if (err instanceof FileNotFoundError) {
        onProgress?.({
          type: 'error',
          message: `Warning: session file not found for ${pair.sessionId.slice(0, 8)}… in ${displayPath(pair.project)}`,
        });
        continue;
      }
      throw err;
    }
  }

  // Step 3: Group by project using parseWorktree
  const projectMap = new Map<
    string,
    {
      originalPath: string;
      sessions: SessionData[];
      worktreeMap: Map<string, SessionData[]>;
    }
  >();

  for (const { pair, data } of sessionResults) {
    const info = parseWorktree(pair.project);
    const parentPath = info.parent;

    if (!projectMap.has(parentPath)) {
      projectMap.set(parentPath, {
        originalPath: parentPath,
        sessions: [],
        worktreeMap: new Map(),
      });
    }

    const bucket = projectMap.get(parentPath)!;

    if (info.worktree) {
      if (!bucket.worktreeMap.has(info.worktree)) {
        bucket.worktreeMap.set(info.worktree, []);
      }
      bucket.worktreeMap.get(info.worktree)!.push(data);
    } else {
      bucket.sessions.push(data);
    }
  }

  // Build ProjectData[]
  const projects: ProjectData[] = [];
  for (const [parentPath, bucket] of projectMap) {
    const worktrees: WorktreeData[] = [];
    for (const [name, sessions] of bucket.worktreeMap) {
      worktrees.push({ name, sessions });
    }
    projects.push({
      path: displayPath(parentPath),
      originalPath: bucket.originalPath,
      sessions: bucket.sessions,
      worktrees,
    });
  }

  // Step 4: Compute metadata
  let totalUserMessages = 0;
  const allTimestamps: number[] = [];

  // Count sessions per project (display path) for focus calculation
  const sessionCountByProject = new Map<string, number>();

  for (const proj of projects) {
    let projSessions = proj.sessions.length;
    for (const wt of proj.worktrees) {
      projSessions += wt.sessions.length;
    }
    sessionCountByProject.set(proj.path, projSessions);

    // Count user messages and collect timestamps
    const allSessions = [
      ...proj.sessions,
      ...proj.worktrees.flatMap(wt => wt.sessions),
    ];
    for (const session of allSessions) {
      for (const msg of session.messages) {
        if (msg.role === 'user') {
          totalUserMessages++;
          if (msg.timestamp) {
            allTimestamps.push(msg.timestamp);
          }
        }
      }
    }
  }

  const totalSessions = sessionResults.length;
  const totalProjects = projects.length;

  // Focus: project with most sessions
  let focusProject = '';
  let focusCount = 0;
  for (const [proj, count] of sessionCountByProject) {
    if (count > focusCount) {
      focusCount = count;
      focusProject = proj;
    }
  }
  const focusPercentage =
    totalSessions > 0 ? Math.round((focusCount / totalSessions) * 100) : 0;

  // Active hours
  const activeHours = getActiveHours(allTimestamps);

  const metadata: Metadata = {
    totalSessions,
    totalProjects,
    totalUserMessages,
    focus: { project: focusProject, percentage: focusPercentage },
    activeHours,
    timestamps: allTimestamps,
  };

  onProgress?.({
    type: 'extracted',
    message: `Extracted ${totalUserMessages} user messages`,
    messages: totalUserMessages,
  });

  return { projects, metadata };
}

// --- Scan all active dates from history.jsonl ---

export interface ActiveDate {
  date: string; // YYYY-MM-DD
  sessions: number;
  projects: number;
}

/** Scan history.jsonl and return all dates that have activity, sorted desc. */
export async function scanActiveDates(): Promise<ActiveDate[]> {
  const historyPath = join(homedir(), '.claude', 'history.jsonl');

  // date → Set of sessionIds, date → Set of projects
  const sessionsByDate = new Map<string, Set<string>>();
  const projectsByDate = new Map<string, Set<string>>();

  let rl;
  try {
    rl = createInterface({
      input: createReadStream(historyPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
  } catch {
    return [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry: { timestamp?: number; sessionId?: string; project?: string };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!entry.timestamp || !entry.sessionId) continue;

    const d = new Date(entry.timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (!sessionsByDate.has(dateStr)) {
      sessionsByDate.set(dateStr, new Set());
      projectsByDate.set(dateStr, new Set());
    }
    sessionsByDate.get(dateStr)!.add(entry.sessionId);
    if (entry.project) {
      projectsByDate.get(dateStr)!.add(entry.project);
    }
  }

  const results: ActiveDate[] = [];
  for (const [date, sessions] of sessionsByDate) {
    results.push({
      date,
      sessions: sessions.size,
      projects: projectsByDate.get(date)?.size ?? 0,
    });
  }

  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}
