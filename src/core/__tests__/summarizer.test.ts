import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectData, Metadata } from '../extractor.js';

// --- Mock claude.js ---

const mockInvoke = vi.fn<(prompt: string) => Promise<string>>();
const mockCheckAvailable = vi.fn<() => Promise<void>>();

class MockClaudeError extends Error {
  exitCode: number;
  stderr: string;
  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = 'ClaudeError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

class MockRateLimitError extends MockClaudeError {
  constructor(message: string, exitCode: number, stderr: string) {
    super(message, exitCode, stderr);
    this.name = 'RateLimitError';
  }
}

vi.mock('../claude.js', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...(args as [string])),
  checkAvailable: (...args: unknown[]) => mockCheckAvailable(...(args as [])),
  ClaudeError: MockClaudeError,
  RateLimitError: MockRateLimitError,
}));

const { estimateTokens, summarize, TOKEN_BUDGET } = await import(
  '../summarizer.js'
);

// --- Helpers ---

function makeProject(
  path: string,
  messageTexts: string[],
): ProjectData {
  return {
    path,
    originalPath: path,
    sessions: [
      {
        sessionId: 'sess-1',
        messages: messageTexts.map((text) => ({
          role: 'user' as const,
          text,
        })),
      },
    ],
    worktrees: [],
  };
}

function makeMetadata(
  projects: ProjectData[],
  overrides: Partial<Metadata> = {},
): Metadata {
  const totalSessions = projects.reduce(
    (sum, p) =>
      sum +
      p.sessions.length +
      p.worktrees.reduce((ws, w) => ws + w.sessions.length, 0),
    0,
  );
  return {
    totalSessions,
    totalProjects: projects.length,
    totalUserMessages: 10,
    focus: { project: projects[0]?.path ?? '', percentage: 50 },
    activeHours: '10:00-18:00',
    timestamps: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: invoke succeeds with a summary
  mockInvoke.mockResolvedValue('## Summary\n- Did some work');
});

// --- estimateTokens ---

describe('estimateTokens', () => {
  it('calculates tokens as ceil(totalChars / 2)', () => {
    // 10 chars per message, 3 messages = 30 chars -> 15 tokens
    const project = makeProject('~/proj', ['1234567890', '1234567890', '1234567890']);
    expect(estimateTokens([project])).toBe(15);
  });

  it('includes worktree messages in count', () => {
    const project: ProjectData = {
      path: '~/proj',
      originalPath: '/proj',
      sessions: [
        {
          sessionId: 's1',
          messages: [{ role: 'user', text: '1234567890' }], // 10 chars
        },
      ],
      worktrees: [
        {
          name: 'wt1',
          sessions: [
            {
              sessionId: 's2',
              messages: [{ role: 'user', text: '1234567890' }], // 10 chars
            },
          ],
        },
      ],
    };
    // 20 chars -> 10 tokens
    expect(estimateTokens([project])).toBe(10);
  });

  it('returns 0 for empty projects', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('rounds up odd char counts', () => {
    const project = makeProject('~/proj', ['123']); // 3 chars -> ceil(3/2) = 2
    expect(estimateTokens([project])).toBe(2);
  });
});

// --- summarize L1 path ---

describe('summarize L1 (under budget)', () => {
  it('makes a single invoke call when under budget', async () => {
    const projects = [makeProject('~/proj', ['short message'])];
    const meta = makeMetadata(projects);

    const result = await summarize(projects, meta, '2026-03-27');

    expect(mockInvoke).toHaveBeenCalledOnce();
    // Result is pure claude output (no header — header is rendered by Ink component)
    expect(result).toContain('## Summary');
  });

  it('returns claude output without header', async () => {
    const projects = [makeProject('~/proj', ['msg'])];
    const meta = makeMetadata(projects);

    const result = await summarize(projects, meta, '2026-03-27');

    // No header in output — it's now rendered separately by the TUI
    expect(result).not.toContain('个项目');
    expect(result).toContain('## Summary');
  });
});

// --- summarize L2 path (split by project) ---

describe('summarize L2 (split by project)', () => {
  it('splits into per-project calls when over budget', async () => {
    // Create projects whose total tokens exceed TOKEN_BUDGET
    const bigText = 'x'.repeat(TOKEN_BUDGET * 2 + 10);
    const projects = [
      makeProject('~/proj-a', [bigText.slice(0, TOKEN_BUDGET)]),
      makeProject('~/proj-b', [bigText.slice(0, TOKEN_BUDGET)]),
    ];
    const meta = makeMetadata(projects);

    mockInvoke.mockResolvedValue('## ~/proj\n- Did work');

    const result = await summarize(projects, meta, '2026-03-27');

    // Should have called invoke once per project (2 calls)
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(result).toContain('## ~/proj');
  });
});

// --- summarize L3 path (split by sessions) ---

describe('summarize L3 (single project over budget)', () => {
  it('splits a huge single project by sessions', async () => {
    // Single project with text exceeding TOKEN_BUDGET
    const bigText = 'y'.repeat(TOKEN_BUDGET * 2 + 100);
    const project: ProjectData = {
      path: '~/big-proj',
      originalPath: '/big-proj',
      sessions: [
        {
          sessionId: 's1',
          messages: [{ role: 'user', text: bigText.slice(0, TOKEN_BUDGET + 50) }],
        },
        {
          sessionId: 's2',
          messages: [{ role: 'user', text: bigText.slice(0, TOKEN_BUDGET + 50) }],
        },
      ],
      worktrees: [],
    };
    const meta = makeMetadata([project]);

    mockInvoke.mockResolvedValue('- chunk result');

    const result = await summarize([project], meta, '2026-03-27');

    // Should have at least 2 invoke calls (one per session chunk)
    expect(mockInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('chunk result');
  });
});

// --- Fallback: L1 failure -> L2 ---

describe('summarize fallback', () => {
  it('falls back to split-by-project on ClaudeError (non-rate-limit)', async () => {
    const projects = [
      makeProject('~/proj-a', ['msg a']),
      makeProject('~/proj-b', ['msg b']),
    ];
    const meta = makeMetadata(projects);

    // First call fails with ClaudeError, subsequent calls succeed
    mockInvoke
      .mockRejectedValueOnce(new MockClaudeError('fail', 1, 'some error'))
      .mockResolvedValue('- fallback result');

    const result = await summarize(projects, meta, '2026-03-27');

    // First call failed, then L2 split made 2 more calls
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    expect(result).toContain('fallback result');
  });

  it('throws RateLimitError without fallback on L1', async () => {
    const projects = [makeProject('~/proj', ['msg'])];
    const meta = makeMetadata(projects);

    mockInvoke.mockRejectedValue(
      new MockRateLimitError('rate limited', 429, '429 too many'),
    );

    await expect(
      summarize(projects, meta, '2026-03-27'),
    ).rejects.toThrow(MockRateLimitError);
  });
});

// --- Rate limit in L2: retry with backoff ---

describe('rate limit handling in L2', () => {
  it('retries on RateLimitError and eventually succeeds', async () => {
    // Force L2 path: estimateTokens = totalChars / 2, so need totalChars >= TOKEN_BUDGET * 2
    const projects = [
      makeProject('~/proj-a', ['a'.repeat(TOKEN_BUDGET * 2)]),
      makeProject('~/proj-b', ['b'.repeat(TOKEN_BUDGET * 2)]),
    ];
    const meta = makeMetadata(projects);

    // Stub sleep to be instant so we don't wait for real backoff delays
    const summarizerModule = await import('../summarizer.js');
    // We can't easily mock the private sleep, but we can use fake timers
    // Approach: use fake timers and flush all pending timers
    vi.useFakeTimers();

    // First call: rate limit, subsequent calls succeed
    let callCount = 0;
    mockInvoke.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(
          new MockRateLimitError('rate limited', 429, '429'),
        );
      }
      return Promise.resolve('- result');
    });

    const promise = summarize(projects, meta, '2026-03-27');

    // Keep advancing timers until the promise settles
    // The invokeWithRetry uses delays of 1000, 2000, 4000ms
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await promise;
    expect(result).toContain('result');
    // At least 2 calls: 1 fail + retry/other
    expect(mockInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  });
});
