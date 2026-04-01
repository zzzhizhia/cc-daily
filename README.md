# cc-daily

Generate daily work reports from Claude Code local conversation history.

Existing tools (ccusage, etc.) tell you "how many tokens you used." cc-daily tells you "what you did."

## Install

```bash
npx cc-daily
```

Requires [Claude Code](https://code.claude.com/) to be installed (`claude` CLI available).

## Usage

### Interactive TUI

```bash
cc-daily
```

Opens a calendar-based TUI:
- Navigate dates with arrow keys, `[`/`]` to switch months
- Green dates = report generated, white = activity recorded, dim = no activity
- Press Enter to view or generate a report
- Reports are rendered with [glow](https://github.com/charmbracelet/glow) if available, with a built-in fallback

### CLI Mode

```bash
# Generate today's report
cc-daily -d 2026-03-27

# Force regeneration
cc-daily -d 2026-03-27 --force

# Extract raw conversation text (no summarization)
cc-daily --raw

# Raw text for a specific date
cc-daily --raw -d 2026-03-27
```

## How It Works

1. Scans `~/.claude/history.jsonl` to find sessions for the target date
2. Reads each session's JSONL file, extracts user message text
3. Merges worktree sessions into their parent project
4. Computes metadata (focus project, active hours, session count)
5. Sends user messages to `claude --model sonnet -p` for summarization
6. Auto-splits by project (or by session) if text exceeds the token budget
7. Saves reports to `~/.cc-daily/reports/YYYY-MM-DD.md`

## Data Sources

cc-daily reads Claude Code's local data (read-only):

- `~/.claude/history.jsonl` — global input history
- `~/.claude/projects/<encoded>/<sessionId>.jsonl` — full conversation records

Reports are stored at `~/.cc-daily/reports/YYYY-MM-DD.md`.

## License

MIT
