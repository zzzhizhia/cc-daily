import { describe, it, expect } from 'vitest';
import { homedir } from 'os';
import { encodePath, displayPath, parseWorktree } from '../paths.js';

describe('encodePath', () => {
  it('replaces all slashes with dashes', () => {
    expect(encodePath('/Users/x/dev')).toBe('-Users-x-dev');
  });

  it('handles root path', () => {
    expect(encodePath('/')).toBe('-');
  });

  it('handles path with no slashes', () => {
    expect(encodePath('mydir')).toBe('mydir');
  });

  it('handles empty string', () => {
    expect(encodePath('')).toBe('');
  });

  it('handles deeply nested path', () => {
    expect(encodePath('/a/b/c/d/e')).toBe('-a-b-c-d-e');
  });

  it('handles trailing slash', () => {
    expect(encodePath('/Users/x/dev/')).toBe('-Users-x-dev-');
  });
});

describe('displayPath', () => {
  const home = homedir();

  it('replaces home directory with ~', () => {
    expect(displayPath(`${home}/projects/app`)).toBe('~/projects/app');
  });

  it('returns home directory itself as ~', () => {
    expect(displayPath(home)).toBe('~');
  });

  it('leaves non-home paths unchanged', () => {
    expect(displayPath('/tmp/something')).toBe('/tmp/something');
  });

  it('leaves path that partially matches home unchanged', () => {
    expect(displayPath('/var/log/app')).toBe('/var/log/app');
  });
});

describe('parseWorktree', () => {
  it('returns parent and null worktree for regular path', () => {
    const result = parseWorktree('/Users/x/dev/app');
    expect(result).toEqual({ parent: '/Users/x/dev/app', worktree: null });
  });

  it('parses worktree path correctly', () => {
    const result = parseWorktree('/Users/x/dev/app/.claude/worktrees/my-branch');
    expect(result).toEqual({
      parent: '/Users/x/dev/app',
      worktree: 'my-branch',
    });
  });

  it('handles worktree path with nested subdirectories after branch name', () => {
    const result = parseWorktree('/Users/zzzhizhi/dev/app/.claude/worktrees/my-branch/src/foo');
    expect(result).toEqual({
      parent: '/Users/zzzhizhi/dev/app',
      worktree: 'my-branch',
    });
  });

  it('handles path that contains .claude but not worktrees', () => {
    const result = parseWorktree('/Users/x/dev/app/.claude/config');
    expect(result).toEqual({
      parent: '/Users/x/dev/app/.claude/config',
      worktree: null,
    });
  });
});
