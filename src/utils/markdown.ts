import { spawn, spawnSync } from 'child_process';
import chalk from 'chalk';
import { marked, type Token, type Tokens } from 'marked';

// --- Glow integration ---

let _glowAvailable: boolean | null = null;

/** Check if glow CLI is available (cached) */
export function isGlowAvailable(): boolean {
  if (_glowAvailable !== null) return _glowAvailable;
  try {
    const result = spawnSync('glow', ['--version'], { stdio: 'ignore', timeout: 3000 });
    _glowAvailable = result.status === 0;
  } catch {
    _glowAvailable = false;
  }
  return _glowAvailable;
}

/** Render markdown via glow CLI (non-interactive: glow -w <width>) */
export async function renderWithGlow(markdown: string, width: number = 78): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('glow', ['--style', 'dark', '-w', String(width), '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
        CLICOLOR_FORCE: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`glow failed (exit ${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.stdin.write(markdown);
    proc.stdin.end();
  });
}

/** Render markdown: try glow first, fallback to built-in renderer */
export async function render(markdown: string, width: number = 78): Promise<string> {
  if (isGlowAvailable()) {
    try {
      return await renderWithGlow(markdown, width);
    } catch {
      // glow failed, fall through to built-in
    }
  }
  return renderMarkdown(markdown);
}

// --- Built-in fallback renderer ---

/**
 * Glow-style terminal Markdown renderer.
 *
 * Renders Markdown to ANSI-styled text similar to charmbracelet/glamour dark style.
 * Uses chalk for ANSI escape codes and marked for parsing.
 */

const INDENT = '  ';
const BULLET = '•';
const BLOCK_QUOTE_BAR = '│';

// --- Inline rendering ---

function renderInline(text: string): string {
  // Process inline tokens from marked lexer
  const tokens = marked.lexer(text, { gfm: true });
  return renderTokens(tokens);
}

function renderTokens(tokens: Token[]): string {
  let out = '';
  for (const token of tokens) {
    out += renderToken(token);
  }
  return out;
}

function renderToken(token: Token): string {
  switch (token.type) {
    case 'text':
      return (token as Tokens.Text).tokens
        ? renderTokens((token as Tokens.Text).tokens!)
        : (token as Tokens.Text).text;

    case 'strong':
      return chalk.bold(renderTokens((token as Tokens.Strong).tokens));

    case 'em':
      return chalk.italic(renderTokens((token as Tokens.Em).tokens));

    case 'codespan':
      return chalk.bgGray.white(` ${(token as Tokens.Codespan).text} `);

    case 'link': {
      const link = token as Tokens.Link;
      const linkText = renderTokens(link.tokens);
      return `${linkText} ${chalk.dim.underline(`(${link.href})`)}`;
    }

    case 'image': {
      const img = token as Tokens.Image;
      return chalk.dim(`[image: ${img.text || img.href}]`);
    }

    case 'del':
      return chalk.strikethrough(renderTokens((token as Tokens.Del).tokens));

    case 'br':
      return '\n';

    case 'escape':
      return (token as Tokens.Escape).text;

    case 'html':
      return chalk.dim((token as Tokens.HTML).text);

    // Block-level tokens that can appear in inline context
    case 'paragraph':
      return renderTokens((token as Tokens.Paragraph).tokens);

    default:
      return 'raw' in token ? String((token as { raw: string }).raw) : '';
  }
}

// --- Block rendering ---

function renderHeading(token: Tokens.Heading): string {
  const text = renderTokens(token.tokens);
  switch (token.depth) {
    case 1:
      return '\n' + chalk.bold.magenta(text) + '\n';
    case 2:
      return '\n' + chalk.bold.cyan(text) + '\n';
    case 3:
      return '\n' + chalk.bold.yellow(text) + '\n';
    default:
      return '\n' + chalk.bold(text) + '\n';
  }
}

function renderParagraph(token: Tokens.Paragraph): string {
  return renderTokens(token.tokens) + '\n';
}

function renderList(token: Tokens.List, depth: number = 0): string {
  const lines: string[] = [];
  const prefix = INDENT.repeat(depth);

  for (let i = 0; i < token.items.length; i++) {
    const item = token.items[i];
    const marker = token.ordered
      ? chalk.dim(`${(token.start || 1) + i}.`)
      : chalk.dim(BULLET);

    const content: string[] = [];
    for (const child of item.tokens) {
      if (child.type === 'list') {
        content.push(renderList(child as Tokens.List, depth + 1));
      } else if (child.type === 'text' && (child as Tokens.Text).tokens) {
        content.push(renderTokens((child as Tokens.Text).tokens!));
      } else {
        content.push(renderToken(child));
      }
    }

    const firstLine = content[0] || '';
    const rest = content.slice(1).join('');
    lines.push(`${prefix}${marker} ${firstLine.trimStart()}`);
    if (rest.trim()) {
      lines.push(rest);
    }
  }

  return lines.join('\n') + '\n';
}

function renderCode(token: Tokens.Code): string {
  const lang = token.lang ? chalk.dim(` ${token.lang}`) : '';
  const lines = token.text.split('\n');
  const rendered = lines
    .map((line) => `${INDENT}${chalk.gray(line)}`)
    .join('\n');
  return `\n${chalk.dim('```')}${lang}\n${rendered}\n${chalk.dim('```')}\n`;
}

function renderBlockquote(token: Tokens.Blockquote): string {
  const inner = renderBlockTokens(token.tokens);
  const lines = inner.split('\n').filter((l) => l !== '');
  return (
    lines
      .map((line) => `${chalk.dim.cyan(BLOCK_QUOTE_BAR)} ${chalk.dim(line)}`)
      .join('\n') + '\n'
  );
}

function renderTable(token: Tokens.Table): string {
  // Calculate column widths
  const colWidths: number[] = token.header.map((h) =>
    stripAnsi(renderTokens(h.tokens)).length,
  );
  for (const row of token.rows) {
    for (let i = 0; i < row.length; i++) {
      const cellLen = stripAnsi(renderTokens(row[i].tokens)).length;
      if (i < colWidths.length) {
        colWidths[i] = Math.max(colWidths[i], cellLen);
      }
    }
  }

  const pad = (text: string, width: number) => {
    const visLen = stripAnsi(text).length;
    return text + ' '.repeat(Math.max(0, width - visLen));
  };

  const lines: string[] = [];

  // Header
  const headerCells = token.header.map((h, i) =>
    chalk.bold(pad(renderTokens(h.tokens), colWidths[i])),
  );
  lines.push(INDENT + headerCells.join(chalk.dim(' │ ')));

  // Separator
  const sep = colWidths.map((w) => '─'.repeat(w)).join(chalk.dim('─┼─'));
  lines.push(INDENT + chalk.dim(sep));

  // Rows
  for (const row of token.rows) {
    const cells = row.map((cell, i) =>
      pad(renderTokens(cell.tokens), colWidths[i]),
    );
    lines.push(INDENT + cells.join(chalk.dim(' │ ')));
  }

  return '\n' + lines.join('\n') + '\n';
}

function renderHr(): string {
  return '\n' + chalk.dim('─'.repeat(40)) + '\n';
}

// --- Main block-level rendering ---

function renderBlockTokens(tokens: Token[]): string {
  let out = '';
  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        out += renderHeading(token as Tokens.Heading);
        break;
      case 'paragraph':
        out += renderParagraph(token as Tokens.Paragraph);
        break;
      case 'list':
        out += renderList(token as Tokens.List);
        break;
      case 'code':
        out += renderCode(token as Tokens.Code);
        break;
      case 'blockquote':
        out += renderBlockquote(token as Tokens.Blockquote);
        break;
      case 'table':
        out += renderTable(token as Tokens.Table);
        break;
      case 'hr':
        out += renderHr();
        break;
      case 'html':
        out += chalk.dim((token as Tokens.HTML).text);
        break;
      case 'space':
        out += '\n';
        break;
      default:
        out += renderToken(token);
        break;
    }
  }
  return out;
}

// --- Public API ---

export function renderMarkdown(markdown: string): string {
  const tokens = marked.lexer(markdown, { gfm: true });
  return renderBlockTokens(tokens);
}

// --- Helpers ---

/** Strip ANSI escape codes for width calculation */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
