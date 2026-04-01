## Why

Claude Code 用户每天在多个项目中进行大量编码、调研、配置等工作，但没有工具能自动从本地对话记录中提取「今天做了什么」的工作叙事。现有工具（ccusage、Claude Usage Tracker 等）全部聚焦于 token 用量和成本统计。ccreport 填补「做了什么」这个空白。

## What Changes

- 新建 TypeScript + Ink CLI 应用 `ccreport`
- 读取 `~/.claude/history.jsonl` 和 `~/.claude/projects/<encoded>/<sessionId>.jsonl`，按日期提取对话文本
- 正确归并 worktree session 到父项目
- 通过 `claude -p` 生成按项目分组的中文日报摘要
- Budget-aware 策略：token 预估 + 三级分拆（全量 → 按项目 → 按 session 组）
- Tweetable 摘要 + 统计概览表格由代码确定性计算，不依赖 LLM
- 日报存储在 `~/.ccreport/reports/YYYY-MM-DD.md`（含 YAML frontmatter）
- 交互式 Ink TUI：日报列表 → 生成进度 → Markdown 渲染查看
- 非交互式 CLI：`-d`、`--force`、`--raw` 参数

## Capabilities

### New Capabilities
- `data-extraction`: 从 history.jsonl + session JSONL 提取对话文本，worktree 归并，元数据统计（Focus、活跃时段）
- `report-generation`: prompt 构造、budget-aware 三级分拆、claude -p 调用编排、结果合并
- `report-storage`: ~/.ccreport/reports/ 的 CRUD，YAML frontmatter 解析/生成
- `interactive-tui`: Ink 交互式界面——日报列表、生成进度、Markdown 渲染查看
- `cli-interface`: 非交互式 CLI 入口——参数解析、动态 import、管道友好

### Modified Capabilities

## Impact

- 新增 10 个源文件（src/cli.ts, app.tsx, 3 screens, 4 core, 3 utils）
- 依赖：ink, react, marked, marked-terminal, pnpm
- 读取 ~/.claude 目录（只读），写入 ~/.ccreport 目录
- 调用 claude -p 子进程（需要用户已安装 Claude Code）
