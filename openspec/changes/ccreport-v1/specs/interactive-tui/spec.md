## ADDED Requirements

### Requirement: Report list screen
The system SHALL display a navigable list of reports. If today's report has not been generated, the list SHALL show "★ 生成今日日报 (Mon DD, Weekday)" at the top. Below it, existing reports are listed in reverse chronological order, each showing "date (weekday)  N projects · M prompts". If today's report exists, the ★ entry disappears and today's entry shows a TODAY marker.

#### Scenario: Today not generated
- **WHEN** no report exists for today
- **THEN** list shows ★ generate entry at top, followed by historical reports

#### Scenario: Today already generated
- **WHEN** today's report exists
- **THEN** list shows today's report with TODAY marker at top, no ★ entry

#### Scenario: No reports exist
- **WHEN** reports directory is empty and today is not generated
- **THEN** list shows only the ★ generate entry

### Requirement: Report list keyboard navigation
The system SHALL support ↑↓ for navigation, Enter to open (★ triggers generation, report entry opens view), and q to quit.

#### Scenario: Enter on generate entry
- **WHEN** user presses Enter on ★ entry
- **THEN** screen transitions to Generating for today's date

#### Scenario: Enter on report entry
- **WHEN** user presses Enter on a historical report
- **THEN** screen transitions to ReportView for that date

#### Scenario: Quit
- **WHEN** user presses q
- **THEN** application exits

### Requirement: Generating screen with progress
The system SHALL display progress steps during report generation:
- "✓ Scanned history.jsonl — N sessions, M projects"
- "✓ Extracted N messages"
- "◐ Summarizing with Claude..."
Upon completion, the screen SHALL automatically transition to ReportView. Upon failure, it SHALL transition back to ReportList with an error message.

#### Scenario: Successful generation
- **WHEN** generation completes successfully
- **THEN** screen auto-transitions to ReportView for the generated date

#### Scenario: Generation failure
- **WHEN** claude -p fails or extraction finds no data
- **THEN** screen transitions back to ReportList with error displayed

### Requirement: Report view with markdown rendering
The system SHALL render the report markdown using marked + marked-terminal, supporting scrolling with ↑↓ keys. Keyboard shortcuts: r to regenerate current report, Esc/← to return to list, q to quit.

#### Scenario: Scroll through report
- **WHEN** report is longer than terminal height
- **THEN** ↑↓ keys scroll the content

#### Scenario: Regenerate from view
- **WHEN** user presses r while viewing a report
- **THEN** screen transitions to Generating for the currently viewed date

#### Scenario: Return to list
- **WHEN** user presses Esc or ←
- **THEN** screen transitions to ReportList

### Requirement: Screen state machine
The application state SHALL be one of: `{ name: 'list' }`, `{ name: 'generating', date: string }`, or `{ name: 'view', date: string }`. Transitions follow the defined state table.

#### Scenario: Full navigation flow
- **WHEN** user navigates list → generate → view → back to list
- **THEN** each transition matches the state table and screen renders correctly
