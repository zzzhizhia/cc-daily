import { spawn } from 'child_process';

export class ClaudeError extends Error {
  constructor(
    message: string,
    public exitCode: number,
    public stderr: string,
  ) {
    super(message);
    this.name = 'ClaudeError';
  }
}

export class RateLimitError extends ClaudeError {
  constructor(message: string, exitCode: number, stderr: string) {
    super(message, exitCode, stderr);
    this.name = 'RateLimitError';
  }
}

/** 5.2 Detect rate-limit signals in stderr */
export function isRateLimit(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too many requests')
  );
}

/** 5.1 Invoke `claude -p` with the given prompt via stdin */
export async function invoke(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--model', 'sonnet', '-p'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const TIMEOUT_MS = 300_000; // 5 minutes — claude -p needs time for API calls + processing
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new ClaudeError('claude -p timed out after 5 minutes', -1, ''));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk;
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        if (isRateLimit(stderr)) {
          reject(new RateLimitError('Rate limited', code ?? 1, stderr));
        } else {
          reject(
            new ClaudeError(
              `claude -p failed with exit code ${code}`,
              code ?? 1,
              stderr,
            ),
          );
        }
      }
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(
        new ClaudeError(`Failed to spawn claude: ${err.message}`, -1, ''),
      );
    });

    // Write prompt via stdin stream (not execSync) to handle large text
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/** 5.3 Check that `claude` CLI is available on PATH */
export async function checkAvailable(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            'Claude Code not found. Install: npm i -g @anthropic-ai/claude-code',
          ),
        );
      }
    });

    proc.on('error', () => {
      reject(
        new Error(
          'Claude Code not found. Install: npm i -g @anthropic-ai/claude-code',
        ),
      );
    });
  });
}
