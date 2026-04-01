import type { ProjectData, Metadata } from './extractor.js';

/**
 * Extract the last 2 segments of a path for concise display.
 * e.g. "~/Developer/myorg/myrepo" -> "myorg/myrepo"
 */
function shortName(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, '').split('/').filter(Boolean);
  return segments.slice(-2).join('/');
}

/** 4.1 Generate the deterministic header: tweetable line + stats table */
export function generateHeader(metadata: Metadata, date: string): string {
  const [, month, day] = date.split('-');
  const datePart = `${Number(month)}/${Number(day)}`;
  const focusShort = shortName(metadata.focus.project);

  const tweetable = `${datePart}: ${metadata.totalProjects}个项目 \u00b7 ${metadata.totalSessions}个session \u00b7 主要推进 ${focusShort}`;

  const focusDisplay = `${shortName(metadata.focus.project)} (${metadata.focus.percentage}%)`;

  const table = [
    '| 指标 | 值 |',
    '|------|-----|',
    `| 项目数 | ${metadata.totalProjects} |`,
    `| Session 数 | ${metadata.totalSessions} |`,
    `| 消息数 | ${metadata.totalUserMessages} |`,
    `| 活跃时段 | ${metadata.activeHours} |`,
    `| Focus | ${focusDisplay} |`,
  ].join('\n');

  return tweetable + '\n\n' + table;
}

const SYSTEM_INSTRUCTION = `你是一位资深工程师的日报助手。根据以下 Claude Code 对话记录，提炼当天的工作内容。

严格要求：
- 每个项目用 ## 项目路径 作为标题
- 标题下用 bullet points 列出关键工作项
- 只提炼「做了什么」和「决策了什么」，不要复述对话过程
- 不要照搬原文，用自己的话概括
- 调研类工作标注为"调研"（如"调研了 XX 方案"）
- 不要输出统计表格或 tweetable（已由代码生成）
- 不要输出任何开头的寒暄或结尾总结
- 语言：中文
- 风格：简洁、事实性，像 standup 汇报

好的输出示例：
## ~/Developer/myproject
- 实现了 extractor.ts 的 session JSONL 解析，支持 user (string) 和 assistant (array) 两种 content 格式
- 修复了 worktree 路径归并逻辑，正确处理 .claude/worktrees/ 下的 session
- 调研了 marked-terminal 的渲染方案，发现不满足需求，改为自写 renderer

坏的输出（不要这样）：
- 用户问了 XX，助手回答了 YY
- 完成。现在 research/ 下只有两个目录...（这是照搬原文）`;

/** 4.2 Format the full prompt for a single claude -p call (all projects) */
export function formatPrompt(projects: ProjectData[], metadata: Metadata): string {
  const context = `上下文：今天有 ${metadata.totalProjects} 个项目、${metadata.totalSessions} 个 session、${metadata.totalUserMessages} 条消息`;

  const projectSections = projects.map(formatProjectSection);

  return [context, '', SYSTEM_INSTRUCTION, '', '---', '', '以下是今天的对话记录：', '', ...projectSections].join('\n');
}

/** 4.3 Format a per-project prompt (for split mode) */
export function formatProjectPrompt(project: ProjectData): string {
  return [SYSTEM_INSTRUCTION, '', '---', '', '以下是该项目的对话记录：', '', formatProjectSection(project)].join('\n');
}

/** 4.4 Merge header + sorted project results */
export function mergeResults(header: string, projectResults: string[]): string {
  const sorted = [...projectResults].sort((a, b) => {
    const headingA = extractHeading(a);
    const headingB = extractHeading(b);
    return headingA.localeCompare(headingB);
  });

  return header + '\n\n' + sorted.join('\n\n');
}

// --- Internal helpers ---

/** Max chars per message to avoid overwhelming the prompt with verbose content */
const MAX_MSG_CHARS = 500;

function truncateText(text: string): string {
  if (text.length <= MAX_MSG_CHARS) return text;
  return text.slice(0, MAX_MSG_CHARS) + '...（截断）';
}

function formatProjectSection(project: ProjectData): string {
  const lines: string[] = [`## ${project.path}`];

  for (const session of project.sessions) {
    for (const msg of session.messages) {
      // Only include user messages — they contain the intent/request.
      // Assistant responses are verbose and cause claude -p to copy verbatim.
      if (msg.role === 'user') {
        lines.push(`> ${truncateText(msg.text)}`);
      }
    }
  }

  for (const wt of project.worktrees) {
    lines.push('', `### Worktree: ${wt.name}`);
    for (const session of wt.sessions) {
      for (const msg of session.messages) {
        if (msg.role === 'user') {
          lines.push(`> ${truncateText(msg.text)}`);
        }
      }
    }
  }

  return lines.join('\n');
}

function extractHeading(text: string): string {
  const match = text.match(/^## (.+)/m);
  return match ? match[1] : '';
}
