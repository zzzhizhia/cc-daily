import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout, useStdin } from 'ink';
import { load } from '../utils/storage.js';
import { render as renderMd } from '../utils/markdown.js';
import type { ReportFrontmatter } from '../utils/storage.js';

interface Props {
  date: string;
  onBack: () => void;
  onRegenerate: (date: string) => void;
}

export function ReportView({ date, onBack, onRegenerate }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { stdin, setRawMode } = useStdin();
  const [meta, setMeta] = useState<ReportFrontmatter | null>(null);
  const [lines, setLines] = useState<string[]>(['Loading...']);
  const [scrollOffset, setScrollOffset] = useState(0);

  const termWidth = stdout?.columns ?? 80;
  const boxWidth = Math.min(termWidth, 84);
  // Reserve rows for: border(2) + meta(~6) + footer(2) + padding(1)
  const termHeight = stdout?.rows ? stdout.rows - 13 : 14;
  const pageSize = Math.max(1, termHeight - 2);

  useEffect(() => {
    loadReport();
  }, [date]);

  // PageUp/PageDown/mouse wheel
  useEffect(() => {
    if (!stdin) return;

    const handler = (data: Buffer) => {
      const seq = data.toString();
      if (seq === '\x1b[5~' || seq.includes('[5~')) {
        setScrollOffset((prev) => Math.max(0, prev - pageSize));
        return;
      }
      if (seq === '\x1b[6~' || seq.includes('[6~')) {
        setScrollOffset((prev) =>
          Math.min(Math.max(0, lines.length - termHeight), prev + pageSize),
        );
        return;
      }
      if (seq === '\x1b[H' || seq === '\x1b[1~') {
        setScrollOffset(0);
        return;
      }
      if (seq === '\x1b[F' || seq === '\x1b[4~') {
        setScrollOffset(Math.max(0, lines.length - termHeight));
        return;
      }
      if (seq.includes('\x1b[M') && data.length >= 6) {
        const button = data[3] & 0xff;
        if (button === 96) {
          setScrollOffset((prev) => Math.max(0, prev - 3));
        } else if (button === 97) {
          setScrollOffset((prev) =>
            Math.min(Math.max(0, lines.length - termHeight), prev + 3),
          );
        }
      }
    };

    stdin.on('data', handler);
    if (setRawMode != null) {
      process.stdout.write('\x1b[?1000h');
      process.stdout.write('\x1b[?1006h');
    }
    return () => {
      stdin.off('data', handler);
      if (setRawMode != null) {
        process.stdout.write('\x1b[?1000l');
        process.stdout.write('\x1b[?1006l');
      }
    };
  }, [stdin, lines.length, termHeight, pageSize]);

  async function loadReport() {
    const report = await load(date);
    if (report) {
      setMeta(report.frontmatter);
      const contentWidth = Math.min(termWidth - 6, 76);
      const rendered = await renderMd(report.body, contentWidth);
      const cleaned = rendered.split('\n').reduce<string[]>((acc, line) => {
        if (line.trim() === '' && acc.length > 0 && acc[acc.length - 1].trim() === '') {
          return acc;
        }
        acc.push(line);
        return acc;
      }, []);
      setLines(cleaned);
    } else {
      setMeta(null);
      setLines(['Report not found.']);
    }
    setScrollOffset(0);
  }

  useInput((input, key) => {
    if (input === 'q') { exit(); return; }
    if (input === 'r') { onRegenerate(date); return; }
    if (key.escape || key.leftArrow) { onBack(); return; }
    if (key.upArrow || input === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow || input === 'j') {
      setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termHeight), prev + 1));
    }
    if (input === 'd') {
      setScrollOffset((prev) => Math.min(Math.max(0, lines.length - termHeight), prev + Math.floor(pageSize / 2)));
    }
    if (input === 'u') {
      setScrollOffset((prev) => Math.max(0, prev - Math.floor(pageSize / 2)));
    }
    if (input === 'g') { setScrollOffset(0); }
    if (input === 'G') { setScrollOffset(Math.max(0, lines.length - termHeight)); }
  });

  const maxScroll = Math.max(0, lines.length - termHeight);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + termHeight);
  const scrollPercent = maxScroll > 0 ? Math.round((scrollOffset / maxScroll) * 100) : 100;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width={boxWidth}>
      {/* Meta header — rendered as Ink components, not markdown */}
      {meta && <MetaHeader meta={meta} />}

      {/* Separator */}
      <Box marginBottom={0}>
        <Text dimColor>{'─'.repeat(boxWidth - 4)}</Text>
      </Box>

      {/* Scroll indicator */}
      <Box justifyContent="flex-end">
        <Text dimColor>{lines.length > termHeight ? `${scrollPercent}%` : ''}</Text>
      </Box>

      {/* Markdown body */}
      <Box flexDirection="column" height={termHeight}>
        <Text>{visibleLines.join('\n')}</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>↑↓/jk · d/u · PgUp/Dn · g/G · r regen · Esc back · q quit</Text>
      </Box>
    </Box>
  );
}

// --- Meta header component ---

function MetaHeader({ meta }: { meta: ReportFrontmatter }) {
  const [, m, d] = meta.date.split('-');
  const tweetable = `${Number(m)}/${Number(d)}: ${meta.projects.length} projects · ${meta.sessions} sessions · ${meta.prompts} messages`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Tweetable line */}
      <Box marginBottom={1}>
        <Text bold color="cyan">{tweetable}</Text>
      </Box>

      {/* Key-value pairs as inline chips */}
      <Box flexWrap="wrap" columnGap={2}>
        <Box>
          <Text dimColor>Active </Text>
          <Text>{meta.activeHours || '—'}</Text>
        </Box>
        <Box>
          <Text dimColor>Focus </Text>
          <Text>{meta.focus || '—'}</Text>
        </Box>
      </Box>
    </Box>
  );
}
