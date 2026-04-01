## ADDED Requirements

### Requirement: Interactive mode by default
The system SHALL enter Ink TUI mode when invoked with no arguments. React and Ink SHALL be loaded via dynamic import only in this code path.

#### Scenario: No arguments
- **WHEN** user runs `ccreport` with no arguments
- **THEN** the interactive TUI launches

#### Scenario: Ink not loaded for non-interactive
- **WHEN** user runs `ccreport --raw`
- **THEN** React/Ink modules are NOT imported

### Requirement: Generate report for specific date
The system SHALL accept `-d YYYY-MM-DD` to generate a report for the specified date in non-interactive mode. If a report already exists for that date, it SHALL be returned without regeneration. With `--force`, existing reports SHALL be overwritten.

#### Scenario: Generate for past date
- **WHEN** user runs `ccreport -d 2026-03-25`
- **THEN** report for March 25 is generated and saved, output to stdout

#### Scenario: Report already exists
- **WHEN** user runs `ccreport -d 2026-03-25` and report exists
- **THEN** existing report content is output without regeneration

#### Scenario: Force regeneration
- **WHEN** user runs `ccreport -d 2026-03-25 --force`
- **THEN** report is regenerated even if it already exists

### Requirement: Raw extraction mode
The system SHALL accept `--raw` to extract raw conversation text to stdout without summarization. Format: per project `## <display path>`, per session `### Session: <id first 8 chars>`, messages prefixed with `[user]` or `[assistant]`. Worktree sessions use `### worktree: <name> / Session: <id>`. Default date is today; combinable with `-d`.

#### Scenario: Raw output today
- **WHEN** user runs `ccreport --raw`
- **THEN** today's raw conversation text is printed to stdout grouped by project

#### Scenario: Raw output specific date
- **WHEN** user runs `ccreport --raw -d 2026-03-25`
- **THEN** March 25's raw text is printed to stdout

#### Scenario: Raw output with worktree
- **WHEN** a session belongs to a worktree
- **THEN** it appears under the parent project with heading `### worktree: <name> / Session: <id>`

### Requirement: Error reporting for missing dependencies
The system SHALL check that `~/.claude` directory exists and `claude` command is available before proceeding. Missing dependencies SHALL produce clear error messages and exit with non-zero code.

#### Scenario: Claude data directory missing
- **WHEN** `~/.claude` does not exist
- **THEN** exit with error "Claude Code data directory not found"

#### Scenario: No activity for date
- **WHEN** specified date has no Claude Code sessions
- **THEN** display "该日期无 Claude Code 活动记录"

### Requirement: Display project paths with home substitution
The system SHALL display project paths with the home directory replaced by `~`. Example: `/Users/zzzhizhi/Developer/app` → `~/Developer/app`.

#### Scenario: Home directory substitution
- **WHEN** project path starts with user's home directory
- **THEN** displayed path replaces home directory with `~`
