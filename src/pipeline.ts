import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { extract } from './core/extractor.js';
import { summarize } from './core/summarizer.js';
import { save, load, exists } from './utils/storage.js';
import { checkAvailable } from './core/claude.js';
import { getToday } from './utils/date.js';
import { render as renderMd } from './utils/markdown.js';
import type { ProgressStep } from './core/extractor.js';
import type { ReportFrontmatter } from './utils/storage.js';

import type { Lang } from './core/formatter.js';

export interface RunArgs {
  date?: string;
  force?: boolean;
  raw?: boolean;
  lang?: Lang;
}

export async function run(args: RunArgs): Promise<void> {
  const date = args.date || getToday();

  // Check dependencies
  if (!existsSync(join(homedir(), '.claude'))) {
    console.error('Claude Code data directory not found');
    process.exit(1);
  }

  if (args.raw) {
    return await runRaw(date);
  }

  // Check if already exists (unless --force)
  if (!args.force && await exists(date)) {
    const report = await load(date);
    if (report) {
      const rendered = process.stdout.isTTY
        ? await renderMd(report.body)
        : report.body;
      console.log(rendered);
      return;
    }
  }

  await checkAvailable();

  // Extract
  const result = await extract(date, (step: ProgressStep) => {
    if (step.type === 'scanned') console.error(`✓ Scanned history.jsonl — ${step.sessions} sessions, ${step.projects} projects`);
    if (step.type === 'extracted') console.error(`✓ Extracted ${step.messages} messages`);
    if (step.type === 'summarizing') console.error('◐ Summarizing with Claude...');
  });

  if (result.projects.length === 0) {
    console.error('No Claude Code activity found for this date');
    process.exit(1);
  }

  // Summarize
  const lang = args.lang ?? 'en';
  const markdown = await summarize(result.projects, result.metadata, date, undefined, lang);

  // Save
  const frontmatter: ReportFrontmatter = {
    date,
    generated: new Date().toISOString(),
    sessions: result.metadata.totalSessions,
    projects: result.projects.map(p => p.path),
    prompts: result.metadata.totalUserMessages,
    focus: `${result.metadata.focus.project} (${result.metadata.focus.percentage}%)`,
    activeHours: result.metadata.activeHours,
  };

  await save(date, frontmatter, markdown);
  const output = process.stdout.isTTY
    ? await renderMd(markdown)
    : markdown;
  console.log(output);
}

async function runRaw(date: string): Promise<void> {
  const result = await extract(date);
  if (result.projects.length === 0) {
    console.error('No Claude Code activity found for this date');
    process.exit(1);
  }

  for (const project of result.projects) {
    console.log(`## ${project.path}\n`);
    for (const session of project.sessions) {
      console.log(`### Session: ${session.sessionId.slice(0, 8)}\n`);
      for (const msg of session.messages) {
        console.log(`[${msg.role}] ${msg.text}\n`);
      }
    }
    for (const wt of project.worktrees) {
      for (const session of wt.sessions) {
        console.log(`### worktree: ${wt.name} / Session: ${session.sessionId.slice(0, 8)}\n`);
        for (const msg of session.messages) {
          console.log(`[${msg.role}] ${msg.text}\n`);
        }
      }
    }
  }
}
