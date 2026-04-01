## ADDED Requirements

### Requirement: Extract sessions by date from history.jsonl
The system SHALL read `~/.claude/history.jsonl` using streaming (readline) and extract all entries matching the specified local date. Timestamps (Unix milliseconds UTC) SHALL be converted to the runtime system timezone for date comparison. Empty lines and JSON-malformed lines SHALL be skipped silently. Output SHALL be a deduplicated set of (sessionId, project) pairs.

#### Scenario: Normal date filtering
- **WHEN** history.jsonl contains entries across multiple dates
- **THEN** only entries whose timestamp falls within the specified local date (00:00:00.000 - 23:59:59.999) are returned

#### Scenario: Empty lines and malformed JSON
- **WHEN** history.jsonl contains empty lines or malformed JSON lines
- **THEN** those lines are skipped and parsing continues

#### Scenario: No entries for date
- **WHEN** the specified date has no matching entries
- **THEN** an empty result set is returned

### Requirement: Extract text from session JSONL files
The system SHALL locate session JSONL files at `~/.claude/projects/<encode(project)>/<sessionId>.jsonl` where `encode` replaces all `/` with `-` (producing a leading `-`). For each file, the system SHALL extract text from top-level `type="user"` entries (content is string) and `type="assistant"` entries (content is array, extract `.text` from items with `type="text"`). All other types SHALL be skipped.

#### Scenario: User message extraction
- **WHEN** a session JSONL line has `type="user"`
- **THEN** `message.content` (string) is extracted as text, and `timestamp` is recorded

#### Scenario: Assistant message extraction
- **WHEN** a session JSONL line has `type="assistant"`
- **THEN** elements with `type="text"` from the `message.content` array have their `.text` field extracted

#### Scenario: Session file not found
- **WHEN** the encoded session JSONL file does not exist
- **THEN** that session is skipped and a warning is emitted via onProgress callback

#### Scenario: Session file exceeds 10MB
- **WHEN** a session JSONL file is larger than 10MB
- **THEN** only the first 500 message entries are extracted, and the session is marked as truncated

#### Scenario: Malformed lines in session JSONL
- **WHEN** a session JSONL line is malformed JSON
- **THEN** that line is skipped and parsing continues

### Requirement: Merge worktree sessions into parent projects
The system SHALL detect worktree paths containing `/.claude/worktrees/<worktree-name>` and merge them into the parent project. The parent project is the path before `/.claude/worktrees/`. The worktree name is the last path segment. Non-worktree paths are left unchanged.

#### Scenario: Worktree path detection
- **WHEN** project path is `~/Dev/app/.claude/worktrees/my-branch`
- **THEN** parent project is `~/Dev/app` and worktree name is `my-branch`

#### Scenario: Regular path
- **WHEN** project path does not contain `/.claude/worktrees/`
- **THEN** it is treated as a standalone project with no worktree

### Requirement: Compute metadata from extracted data
The system SHALL compute the following metadata without LLM involvement:
- Per-project session count and user message count
- Focus: the project with the highest session count and its percentage
- Active hours: user message timestamps grouped by hour, consecutive active hours merged into time ranges

#### Scenario: Focus calculation
- **WHEN** project A has 7 sessions and project B has 3 sessions
- **THEN** Focus is "project A (70%)"

#### Scenario: Active hours detection
- **WHEN** user messages have timestamps at hours 14, 15, 16, 17, 22, 23, 0
- **THEN** active hours are "14:00-18:00, 22:00-01:00"
