import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { list } from '../utils/storage.js';
import { scanActiveDates } from '../core/extractor.js';
import type { ActiveDate } from '../core/extractor.js';
import type { Report } from '../utils/storage.js';
import { getToday, formatDate } from '../utils/date.js';
import type { Lang } from '../core/formatter.js';

// --- Types ---

interface Props {
  lang: Lang;
  error: string | null;
  onToggleLang: () => void;
  onGenerate: (date: string) => void;
  onView: (date: string) => void;
}

// --- Calendar helpers ---

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 0 = Monday, 6 = Sunday (ISO weekday) */
function startWeekday(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert Sunday=0 to Monday-based
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// --- Component ---

export function ReportList({ lang, error, onToggleLang, onGenerate, onView }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const today = getToday();
  const [todayY, todayM] = today.split('-').map(Number);

  const [year, setYear] = useState(todayY);
  const [month, setMonth] = useState(todayM - 1); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(Number(today.split('-')[2]));
  const [loading, setLoading] = useState(true);

  // Data maps
  const [reportMap, setReportMap] = useState<Map<string, Report>>(new Map());
  const [activeMap, setActiveMap] = useState<Map<string, ActiveDate>>(new Map());

  const termWidth = stdout?.columns ?? 80;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [reports, activeDates] = await Promise.all([list(), scanActiveDates()]);
    setReportMap(new Map(reports.map((r) => [r.frontmatter.date, r])));
    setActiveMap(new Map(activeDates.map((ad) => [ad.date, ad])));
    setLoading(false);
  }

  // Build calendar grid for current month
  const numDays = daysInMonth(year, month);
  const firstWeekday = startWeekday(year, month);

  // Clamp selectedDay to valid range
  const clampedDay = Math.min(selectedDay, numDays);
  const selectedDate = dateStr(year, month, clampedDay);

  // Build day info for selected
  const selectedReport = reportMap.get(selectedDate);
  const selectedActivity = activeMap.get(selectedDate);
  const selectedIsToday = selectedDate === today;

  // Navigate months
  function prevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
    setSelectedDay(1);
  }

  function nextMonth() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
    setSelectedDay(1);
  }

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    // Language toggle
    if (input === 'e' || input === 'c') {
      onToggleLang();
      return;
    }

    // Month navigation
    if (input === '[' || input === 'h') {
      prevMonth();
      return;
    }
    if (input === ']' || input === 'l') {
      nextMonth();
      return;
    }

    // Day navigation
    if (key.leftArrow) {
      setSelectedDay((d) => Math.max(1, d - 1));
      return;
    }
    if (key.rightArrow) {
      setSelectedDay((d) => Math.min(numDays, d + 1));
      return;
    }
    if (key.upArrow) {
      setSelectedDay((d) => Math.max(1, d - 7));
      return;
    }
    if (key.downArrow) {
      setSelectedDay((d) => Math.min(numDays, d + 7));
      return;
    }

    // Jump to today
    if (input === 't') {
      setYear(todayY);
      setMonth(todayM - 1);
      setSelectedDay(Number(today.split('-')[2]));
      return;
    }

    // Enter: open or generate
    if (key.return) {
      if (selectedReport) {
        onView(selectedDate);
      } else if (selectedActivity) {
        onGenerate(selectedDate);
      }
    }
  });

  if (loading) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={Math.min(termWidth, 64)}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // --- Render calendar grid ---
  const calendarRows: { day: number; weekday: number }[][] = [];
  let currentRow: { day: number; weekday: number }[] = [];

  // Fill leading blanks
  for (let i = 0; i < firstWeekday; i++) {
    currentRow.push({ day: 0, weekday: i });
  }

  for (let d = 1; d <= numDays; d++) {
    const wd = (firstWeekday + d - 1) % 7;
    currentRow.push({ day: d, weekday: wd });
    if (wd === 6 || d === numDays) {
      calendarRows.push(currentRow);
      currentRow = [];
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      width={Math.min(termWidth, 64)}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">cc-daily</Text>
        <Text dimColor> — Claude Code Daily Reports </Text>
        <Text color={lang === 'en' ? 'green' : 'yellow'}>[{lang.toUpperCase()}]</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {/* Main layout: Calendar left + Detail right */}
      <Box>
        {/* Left: Calendar */}
        <Box flexDirection="column" marginRight={2}>
          {/* Month header */}
          <Box>
            <Text dimColor>{'◀ '}</Text>
            <Text bold>{MONTH_NAMES[month]} {year}</Text>
            <Text dimColor>{' ▶'}</Text>
          </Box>

          {/* Weekday header */}
          <Box>
            {WEEKDAYS.map((wd) => (
              <Box key={wd} width={4}>
                <Text dimColor>{wd}</Text>
              </Box>
            ))}
          </Box>

          {/* Day grid */}
          {calendarRows.map((row, ri) => (
            <Box key={ri}>
              {row.map((cell, ci) => {
                if (cell.day === 0) {
                  return <Box key={`blank-${ci}`} width={4}><Text>{'    '}</Text></Box>;
                }
                const ds = dateStr(year, month, cell.day);
                const hasReport = reportMap.has(ds);
                const hasActivity = activeMap.has(ds);
                const isSelected = cell.day === clampedDay;
                const isToday = ds === today;

                // Style: generated = cyan bold, active = normal white, inactive = dim
                // Selected = inverse (swap fg/bg)
                let color: string | undefined;
                let bold = false;
                let dim = false;
                let inverse = false;

                if (hasReport) {
                  color = 'cyan';
                  bold = true;
                } else if (hasActivity) {
                  color = 'white';
                } else {
                  dim = true;
                }

                if (isSelected) {
                  inverse = true;
                  bold = true;
                }

                const label = String(cell.day).padStart(2, ' ');

                return (
                  <Box key={cell.day} width={4}>
                    <Text
                      color={color}
                      inverse={inverse}
                      bold={bold || isToday}
                      dimColor={dim}
                      underline={isToday && !isSelected}
                    >
                      {label}
                    </Text>
                    <Text>{' '}</Text>
                  </Box>
                );
              })}
              {/* Pad short rows */}
              {row.length < 7 && Array.from({ length: 7 - row.length }).map((_, i) => (
                <Box key={`pad-${i}`} width={4}><Text>{'    '}</Text></Box>
              ))}
            </Box>
          ))}

          {/* Legend */}
          <Box marginTop={1}>
            <Text color="cyan" bold>27 </Text><Text dimColor>Generated  </Text>
            <Text color="white">27 </Text><Text dimColor>Active  </Text>
            <Text dimColor>27 No activity</Text>
          </Box>
        </Box>

        {/* Right: Detail panel */}
        <Box flexDirection="column" width={28} borderStyle="single" borderColor="gray" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold>{formatDate(selectedDate)}</Text>
            {selectedIsToday && <Text color="cyan"> TODAY</Text>}
          </Box>

          {selectedReport ? (
            <Box flexDirection="column">
              <Text color="green">● Generated</Text>
              <Text> </Text>
              <Text>Projects: <Text bold>{selectedReport.frontmatter.projects.length}</Text></Text>
              <Text>Messages: <Text bold>{selectedReport.frontmatter.prompts}</Text></Text>
              <Text>Focus: <Text dimColor>{selectedReport.frontmatter.focus}</Text></Text>
              <Text>Active: <Text dimColor>{selectedReport.frontmatter.activeHours}</Text></Text>
              <Text> </Text>
              <Text color="cyan">Enter to view</Text>
            </Box>
          ) : selectedActivity ? (
            <Box flexDirection="column">
              <Text color="yellow">○ Not generated</Text>
              <Text> </Text>
              <Text>Projects: <Text bold>{selectedActivity.projects}</Text></Text>
              <Text>Sessions: <Text bold>{selectedActivity.sessions}</Text></Text>
              <Text> </Text>
              <Text color="yellow">Enter to generate</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text dimColor>No activity</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>←→↑↓ select · [/] month · t today · e/c lang · Enter open · q quit</Text>
      </Box>
    </Box>
  );
}
