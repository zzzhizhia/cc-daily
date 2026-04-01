## Context

Greenfield TypeScript CLI 应用。通过分析 `~/.claude/` 下的本地对话数据，生成按项目分组的每日工作叙事。

数据源已通过实际数据验证：
- `~/.claude/history.jsonl`：全局输入历史（timestamp 为 Unix 毫秒，project 为原始路径）
- `~/.claude/projects/<encoded>/<sessionId>.jsonl`：完整对话记录
  - 路径编码：`path.replace(/\//g, '-')`，产生前导 `-`
  - user 消息 content 是 **string**；assistant 消息 content 是 **array**
  - 顶层 type：`user | assistant | progress | file-history-snapshot | queue-operation | system`

## Goals / Non-Goals

**Goals:**
- 从 Claude Code 对话记录中提取每日工作内容，生成结构化日报
- 提供交互式 TUI 和非交互式 CLI 两种使用方式
- 正确处理 worktree session 归并
- 处理重度用户（50+ session/天）的大文本量场景

**Non-Goals:**
- Token 用量/成本统计（ccusage 已做）
- 自定义 prompt/语言（v2）
- Git commit 信息集成（v2）
- 云端同步/团队协作
- 支持非 Claude Code 的 AI 工具

## Decisions

### D1: Tweetable + 统计表格永远由代码确定性计算

**选择**: formatter.ts 用元数据生成 tweetable 摘要和统计概览，claude -p 只生成项目详情 bullets。
**替代方案**: 单次模式让 LLM 生成全部内容。
**理由**: 数数是确定性操作，LLM 可能不准。两条路径生成同一输出区域会导致风格不一致。消除 DRY 违反。

### D2: summarizer 拆为编排层 + 执行层

**选择**: `summarizer.ts`（编排：budget 判断 / 分拆决策 / fallback / 并发控制）+ `claude.ts`（执行：spawn / stdin stream / timeout / kill）。
**替代方案**: 单文件内用函数拆分。
**理由**: 拆为两层后，编排逻辑可以 mock claude.ts 独立测试。7 个职责放在一个文件中违反单一职责。

### D3: CLI 入口 cli.ts + 动态 import

**选择**: 入口文件为 `cli.ts`（非 tsx），解析参数后根据模式动态 `import()` Ink 或 core。
**替代方案**: 统一 cli.tsx 入口，顶层 import Ink。
**理由**: 非交互模式（`--raw | grep`）不应加载 React/Ink，避免 200-500ms 启动开销。

### D4: 进度通信使用 callback 参数

**选择**: 核心管道函数接受可选 `onProgress?: (step: ProgressStep) => void` callback。
**替代方案**: EventEmitter 或 AsyncGenerator。
**理由**: Callback 最简单，与 Ink 的 setState 配合最好。非交互模式不传 callback，零开销。

### D5: Worktree 归并在 extractor 层完成

**选择**: extractor 提取时调用 `paths.parseWorktree()` 完成归并，输出已归并的 ProjectData[]。
**替代方案**: 在 formatter 层归并。
**理由**: 归并是数据层职责，越早做越好。下游所有消费者（formatter、--raw、元数据计算）都不用重复处理。

### D6: 三级分拆策略

**选择**:
- L1: 全量 < TOKEN_BUDGET → 单次 claude -p
- L2: 总量超 → 按项目分拆，并行调用（concurrency=3）
- L3: 单项目超 → 该项目内按 session 组再分拆
- Fallback: 单次失败 → 自动回退到 L2

**替代方案**: 降级策略（只发 user 消息 / 截断）。
**理由**: 分拆保留完整上下文不丢信息，降级会损失摘要质量。

### D7: history.jsonl 流式读取

**选择**: 使用 `readline` + `createReadStream` 逐行读取过滤。
**替代方案**: `readFile` 全量加载。
**理由**: history.jsonl 是追加式日志无限增长，半年后可能数十 MB。流式读取对小文件无开销，对大文件避免 OOM。

### D8: 单次模式 prompt 注入元数据 context

**选择**: prompt 开头加一行"今天有 N 个项目、M 个 session、K 条消息"。
**替代方案**: 不注入，让 LLM 自行推断。
**理由**: 零成本，帮助 LLM 理解全局视角，可能提升摘要质量。

## Risks / Trade-offs

- **claude -p context window 上限未知** → TOKEN_BUDGET 设为可配置常量（默认 150K），可实测调整。失败时自动 fallback 到分拆模式。
- **并行 claude -p 可能触发 rate limit** → 429 检测 + 降为串行 + 指数退避重试。
- **Claude Code 数据格式可能变更** → 只读已验证的字段，跳过未知 type，容错解析。
- **Ink 增加依赖复杂度** → 动态 import 确保非交互模式不受影响。TUI 是开源项目的差异化亮点，值得。
- **spawn claude -p 传大文本时 buffer 溢出** → 使用 spawn + stdin stream（不用 execSync）。

## Architecture

```
cli.ts (入口，非 tsx)
  ├── parseArgs()
  ├── if --raw/-d → import('./pipeline') → core 直接调用
  └── if 无参数  → import('ink') + import('./app') → Ink TUI

core pipeline:
  extractor.ts → formatter.ts → summarizer.ts → storage.ts
                                      ↓
                                 claude.ts (执行层)

src/
├── cli.ts
├── app.tsx
├── screens/ (ReportList, ReportView, Generating)
├── core/ (extractor, formatter, summarizer, claude)
└── utils/ (paths, storage, date)
```
