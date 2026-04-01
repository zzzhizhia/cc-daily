import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { extract } from '../core/extractor.js';
import { summarize } from '../core/summarizer.js';
import { checkAvailable } from '../core/claude.js';
import { save } from '../utils/storage.js';
import type { ProgressStep } from '../core/extractor.js';
import type { ReportFrontmatter } from '../utils/storage.js';
import type { Lang } from '../core/formatter.js';

interface Props {
  date: string;
  lang?: Lang;
  onComplete: (date: string) => void;
  onError: (message: string) => void;
}

export function Generating({ date, lang = 'zh', onComplete, onError }: Props) {
  const { stdout } = useStdout();
  const [steps, setSteps] = useState<string[]>([]);
  const [current, setCurrent] = useState('Starting...');

  const termWidth = stdout?.columns ?? 80;

  useEffect(() => {
    generate();
  }, []);

  async function generate() {
    try {
      await checkAvailable();

      const result = await extract(date, (step: ProgressStep) => {
        if (step.type === 'scanned') {
          setSteps(prev => [
            ...prev,
            `✓ Scanned history.jsonl — ${step.sessions} sessions, ${step.projects} projects`,
          ]);
        }
        if (step.type === 'extracted') {
          setSteps(prev => [...prev, `✓ Extracted ${step.messages} messages`]);
        }
        if (step.type === 'summarizing') {
          setCurrent('◐ Summarizing with Claude...');
        }
      });

      if (result.projects.length === 0) {
        onError('No Claude Code activity found for this date');
        return;
      }

      setCurrent('◐ Summarizing with Claude...');

      const markdown = await summarize(
        result.projects,
        result.metadata,
        date,
        (step) => {
          if (step.type === 'summarizing') {
            setCurrent(`◐ ${step.message}`);
          }
        },
        lang,
      );

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
      onComplete(date);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      width={Math.min(termWidth, 60)}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">Generating report for {date}</Text>
      </Box>

      {/* Completed steps */}
      {steps.map((step, i) => (
        <Text key={i} color="green">
          {step}
        </Text>
      ))}

      {/* Current step */}
      <Text color="yellow">{current}</Text>
    </Box>
  );
}
