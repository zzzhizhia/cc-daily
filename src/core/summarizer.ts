import type {
  ProjectData,
  Metadata,
  ProgressStep,
} from './extractor.js';
import { formatPrompt, formatProjectPrompt, mergeResults } from './formatter.js';
import { invoke, ClaudeError, RateLimitError } from './claude.js';

export const TOKEN_BUDGET = 150_000;
export const MAX_CONCURRENCY = 3;

/** 6.1 Rough token estimate: total chars / 2 */
export function estimateTokens(projects: ProjectData[]): number {
  let totalChars = 0;
  for (const project of projects) {
    for (const session of project.sessions) {
      for (const msg of session.messages) {
        totalChars += msg.text.length;
      }
    }
    for (const wt of project.worktrees) {
      for (const session of wt.sessions) {
        for (const msg of session.messages) {
          totalChars += msg.text.length;
        }
      }
    }
  }
  return Math.ceil(totalChars / 2);
}

/** 6.2-6.7 Main summarize entry point with L1/L2/L3 tiered strategy */
export async function summarize(
  projects: ProjectData[],
  metadata: Metadata,
  _date: string,
  onProgress?: (step: ProgressStep) => void,
): Promise<string> {
  onProgress?.({ type: 'summarizing', message: 'Summarizing with Claude...' });

  const totalTokens = estimateTokens(projects);

  if (totalTokens < TOKEN_BUDGET) {
    // L1: single call with all projects
    try {
      const prompt = formatPrompt(projects, metadata);
      return await invoke(prompt);
    } catch (err) {
      // Fallback to L2 on non-rate-limit errors
      if (err instanceof ClaudeError && !(err instanceof RateLimitError)) {
        return await splitByProject(projects, metadata, onProgress);
      }
      throw err;
    }
  } else {
    // L2/L3: split by project
    return await splitByProject(projects, metadata, onProgress);
  }
}

/** L2: split by project, with optional L3 fallback for huge projects */
async function splitByProject(
  projects: ProjectData[],
  _metadata: Metadata,
  onProgress?: (step: ProgressStep) => void,
): Promise<string> {
  let concurrency = MAX_CONCURRENCY;

  const tasks = projects.map((project) => {
    return async (): Promise<string> => {
      const projectTokens = estimateTokens([project]);

      if (projectTokens >= TOKEN_BUDGET) {
        // L3: split this project by sessions
        return await splitProjectBySessions(project);
      }

      const prompt = formatProjectPrompt(project);
      return await invokeWithRetry(prompt, () => {
        // On rate limit, reduce concurrency for subsequent tasks
        concurrency = 1;
      });
    };
  });

  onProgress?.({
    type: 'summarizing',
    message: `Summarizing ${projects.length} projects (concurrency: ${concurrency})...`,
  });

  const results = await runWithConcurrency(tasks, () => concurrency);

  return mergeResults('', results);
}

/** L3: split a single large project into session chunks */
async function splitProjectBySessions(
  project: ProjectData,
): Promise<string> {
  // Collect all sessions (main + worktree)
  interface TaggedSession {
    session: { messages: { role: string; text: string }[] };
    worktreeName: string | null;
  }

  const allSessions: TaggedSession[] = [];
  for (const session of project.sessions) {
    allSessions.push({ session, worktreeName: null });
  }
  for (const wt of project.worktrees) {
    for (const session of wt.sessions) {
      allSessions.push({ session, worktreeName: wt.name });
    }
  }

  // Group sessions into chunks within TOKEN_BUDGET
  const chunks: TaggedSession[][] = [];
  let currentChunk: TaggedSession[] = [];
  let currentTokens = 0;

  for (const tagged of allSessions) {
    let sessionChars = 0;
    for (const msg of tagged.session.messages) {
      sessionChars += msg.text.length;
    }
    const sessionTokens = Math.ceil(sessionChars / 2);

    if (currentTokens + sessionTokens >= TOKEN_BUDGET && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
    currentChunk.push(tagged);
    currentTokens += sessionTokens;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // Invoke claude for each chunk
  const chunkResults: string[] = [];
  for (const chunk of chunks) {
    // Build a mini ProjectData for this chunk
    const mainSessions = chunk
      .filter((t) => t.worktreeName === null)
      .map((t) => t.session);
    const worktreeMap = new Map<string, typeof mainSessions>();
    for (const t of chunk) {
      if (t.worktreeName !== null) {
        if (!worktreeMap.has(t.worktreeName)) {
          worktreeMap.set(t.worktreeName, []);
        }
        worktreeMap.get(t.worktreeName)!.push(t.session);
      }
    }

    const miniProject: ProjectData = {
      path: project.path,
      originalPath: project.originalPath,
      sessions: mainSessions as ProjectData['sessions'],
      worktrees: [...worktreeMap.entries()].map(([name, sessions]) => ({
        name,
        sessions: sessions as ProjectData['worktrees'][number]['sessions'],
      })),
    };

    const prompt = formatProjectPrompt(miniProject);
    const result = await invokeWithRetry(prompt);
    chunkResults.push(result);
  }

  // Merge chunk results into a single project result
  return chunkResults.join('\n\n');
}

/** Invoke claude with exponential backoff on rate limits */
async function invokeWithRetry(
  prompt: string,
  onRateLimit?: () => void,
  maxRetries = 3,
): Promise<string> {
  let delay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await invoke(prompt);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < maxRetries) {
        onRateLimit?.();
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('Unexpected: exceeded retry loop');
}

/** Concurrency pool with dynamic concurrency support */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  getConcurrency: () => number,
): Promise<T[]> {
  const results: (T | undefined)[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const initialConcurrency = Math.min(getConcurrency(), tasks.length);
  const workers = Array.from({ length: initialConcurrency }, () => worker());
  await Promise.all(workers);
  return results as T[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
