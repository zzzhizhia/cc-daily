import { homedir } from 'os';

/** Encode project path for filesystem lookup: replace all / with - */
export function encodePath(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

/** Display path: replace home directory with ~ */
export function displayPath(projectPath: string): string {
  const home = homedir();
  if (projectPath.startsWith(home)) {
    return '~' + projectPath.slice(home.length);
  }
  return projectPath;
}

/** Parse worktree info from project path */
export interface WorktreeInfo {
  parent: string;
  worktree: string | null;
}

const WORKTREE_MARKER = '/.claude/worktrees/';

export function parseWorktree(projectPath: string): WorktreeInfo {
  const idx = projectPath.indexOf(WORKTREE_MARKER);
  if (idx === -1) {
    return { parent: projectPath, worktree: null };
  }
  const parent = projectPath.slice(0, idx);
  const worktree = projectPath.slice(idx + WORKTREE_MARKER.length).split('/')[0];
  return { parent, worktree };
}
