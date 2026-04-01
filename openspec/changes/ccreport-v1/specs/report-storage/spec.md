## ADDED Requirements

### Requirement: Save report with YAML frontmatter
The system SHALL save reports to `~/.ccreport/reports/YYYY-MM-DD.md` with YAML frontmatter containing: date, generated (ISO 8601 with timezone), sessions, projects (array of display paths), prompts (user input count from history.jsonl), focus, and activeHours. The directory SHALL be created automatically (mkdirp) if it does not exist. Write errors (including ENOSPC) SHALL be caught and reported to the user.

#### Scenario: First-time save
- **WHEN** `~/.ccreport/reports/` does not exist
- **THEN** the directory is created and the report is saved successfully

#### Scenario: Disk full
- **WHEN** writeFile fails with ENOSPC
- **THEN** the user receives a clear error message about insufficient disk space

#### Scenario: Overwrite existing report
- **WHEN** a report for the same date already exists and --force is specified
- **THEN** the existing report is overwritten

### Requirement: Load and parse existing reports
The system SHALL read report files from `~/.ccreport/reports/`, parse the YAML frontmatter to extract metadata (date, sessions, projects count, prompts count, focus, activeHours), and return the markdown body separately.

#### Scenario: Load report with valid frontmatter
- **WHEN** a report file exists with valid YAML frontmatter
- **THEN** metadata and markdown body are returned separately

#### Scenario: Malformed frontmatter
- **WHEN** a report file has malformed YAML frontmatter
- **THEN** the file is treated as having no metadata, body is returned as-is

### Requirement: List existing reports
The system SHALL scan `~/.ccreport/reports/` directory for `*.md` files, extract dates from filenames (YYYY-MM-DD.md pattern), load frontmatter metadata for each, and return them sorted by date descending.

#### Scenario: Multiple reports exist
- **WHEN** reports directory contains 2026-03-25.md, 2026-03-27.md, 2026-03-26.md
- **THEN** list returns them in order: 2026-03-27, 2026-03-26, 2026-03-25

#### Scenario: Empty reports directory
- **WHEN** reports directory is empty or does not exist
- **THEN** an empty list is returned

### Requirement: Check report existence
The system SHALL check if a report exists for a given date without loading its full content.

#### Scenario: Report exists
- **WHEN** checking for 2026-03-27 and file exists
- **THEN** returns true

#### Scenario: Report does not exist
- **WHEN** checking for 2026-03-27 and file does not exist
- **THEN** returns false
