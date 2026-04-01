## 1. Project Setup

- [x] 1.1 Initialize project: pnpm init, tsconfig.json, .gitignore, configure TypeScript with ESM output
- [x] 1.2 Install dependencies: ink, react, marked, marked-terminal, and dev dependencies (@types/react, typescript, tsx)
- [x] 1.3 Configure package.json bin entry pointing to dist/cli.js, add build and dev scripts

## 2. Utils

- [x] 2.1 Implement paths.ts: encode(path) → replace / with -, display(path) → replace home with ~, parseWorktree(path) → { parent, worktree }
- [x] 2.2 Implement date.ts: getLocalDateRange(dateStr) → [startMs, endMs], isDateInRange(timestampMs, dateStr), formatDate(dateStr), getActiveHours(timestamps) → time range string
- [x] 2.3 Implement storage.ts: save(date, frontmatter, markdown), load(date), list(), exists(date), with mkdirp and ENOSPC error handling
- [x] 2.4 Write unit tests for paths.ts (encode, display, parseWorktree with worktree and regular paths)
- [x] 2.5 Write unit tests for date.ts (date range, timezone handling, active hours merging including midnight wrap)
- [x] 2.6 Write unit tests for storage.ts (save/load/list/exists with temp directory, frontmatter parsing, malformed files)

## 3. Core: Data Extraction

- [x] 3.1 Implement extractor.ts: streamHistoryByDate(date) using readline to filter history.jsonl entries
- [x] 3.2 Implement extractor.ts: extractSessionText(sessionId, project) to read session JSONL, handle user(string) and assistant(array) content formats
- [x] 3.3 Implement extractor.ts: extract(date, onProgress?) → { projects: ProjectData[], metadata: Metadata } with worktree merging via paths.parseWorktree
- [x] 3.4 Handle edge cases: session file not found (skip+warn), file >10MB (truncate to 500 entries), malformed JSON lines (skip)
- [x] 3.5 Write unit tests for extractor with fixture JSONL files covering: date filtering, user/assistant content formats, worktree merging, missing files, malformed lines, metadata computation (focus, active hours)

## 4. Core: Report Formatting

- [x] 4.1 Implement formatter.ts: generateHeader(metadata) → tweetable line + statistics table markdown (deterministic, no LLM)
- [x] 4.2 Implement formatter.ts: formatPrompt(projects, metadata) → single-mode prompt string with metadata context injection
- [x] 4.3 Implement formatter.ts: formatProjectPrompt(project) → split-mode per-project prompt
- [x] 4.4 Implement formatter.ts: mergeResults(header, projectResults) → final markdown sorted by project name
- [x] 4.5 Write unit tests for formatter: header generation, prompt construction with metadata, merge sorting

## 5. Core: Claude Execution

- [x] 5.1 Implement claude.ts: invoke(prompt) → Promise<string> using spawn + stdin stream, 120s timeout, exit code and stderr parsing
- [x] 5.2 Implement claude.ts: rate-limit detection (429 / keyword match in stderr), distinguish from other errors
- [x] 5.3 Implement claude.ts: checkAvailable() to verify claude command exists
- [x] 5.4 Write unit tests for claude.ts: mock spawn to test timeout handling, error classification, rate-limit detection

## 6. Core: Summarizer Orchestration

- [x] 6.1 Implement summarizer.ts: estimateTokens(projects) → total chars / 2
- [x] 6.2 Implement summarizer.ts: L1 path — total < TOKEN_BUDGET → single call via claude.invoke()
- [x] 6.3 Implement summarizer.ts: L2 path — split by project, parallel calls with concurrency limit (Promise pool, max 3)
- [x] 6.4 Implement summarizer.ts: L3 path — single project over budget → split by session groups
- [x] 6.5 Implement summarizer.ts: fallback — single call failure → auto-retry as L2 split
- [x] 6.6 Implement summarizer.ts: rate-limit handling — detect 429, reduce concurrency to 1, exponential backoff
- [x] 6.7 Implement summarizer.ts: onProgress callback integration for each step
- [x] 6.8 Write unit tests for summarizer: mock claude.ts to test budget decisions (L1/L2/L3), fallback logic, concurrency control, rate-limit degradation

## 7. CLI Non-Interactive Mode

- [x] 7.1 Implement cli.ts: argument parsing (-d, --force, --raw, no args detection)
- [x] 7.2 Implement pipeline.ts: run(args) → orchestrate extract → format → summarize → save for non-interactive mode
- [x] 7.3 Implement --raw mode: extract → format raw output to stdout (project/session/message structure)
- [x] 7.4 Implement -d mode: generate for specific date, respect --force and existing reports
- [x] 7.5 Implement error exits: missing ~/.claude, missing claude command, no sessions for date
- [x] 7.6 Write integration tests for CLI: --raw output format, -d generation, error cases

## 8. Ink TUI

- [x] 8.1 Implement app.tsx: Screen state machine (list | generating | view) with transitions per state table
- [x] 8.2 Implement ReportList.tsx: ★ generate entry, TODAY marker, historical reports with metadata, ↑↓/Enter/q keyboard handling
- [x] 8.3 Implement Generating.tsx: progress step display (scanned/extracted/summarizing), auto-transition on complete, error transition on failure
- [x] 8.4 Implement ReportView.tsx: marked + marked-terminal rendering, ↑↓ scroll, r regenerate, Esc/← back, q quit
- [x] 8.5 Wire dynamic import in cli.ts: no args → import('ink') + import('./app')
- [ ] 8.6 Manual TUI testing: full flow — list → generate → view → back → view existing → regenerate

## 9. Polish & Ship

- [x] 9.1 Add shebang to cli.ts entry point, verify pnpm build produces working dist/
- [x] 9.2 Test with real ~/.claude data: verify extraction, worktree merging, and generation quality
- [x] 9.3 Write README.md: installation, usage (interactive + CLI), screenshots
- [ ] 9.4 End-to-end test: ccreport (TUI), ccreport -d today, ccreport --raw, ccreport -d today --force
