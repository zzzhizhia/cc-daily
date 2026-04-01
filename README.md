# ccreport

从 Claude Code 本地对话记录中自动生成每日工作日报。

现有工具（ccusage 等）告诉你"用了多少 token"，ccreport 告诉你"做了什么"。

## 安装

```bash
# 依赖：需要已安装 Claude Code
npm i -g @anthropic-ai/claude-code

# 安装 ccreport
pnpm install
pnpm build
pnpm link --global
```

## 使用

### 交互式 TUI

```bash
ccreport
```

无参数启动进入交互式界面：
- 日报列表（按日期倒序，显示项目数和消息数）
- 选择 ★ 生成今日日报
- 查看已有日报（Markdown 渲染）
- 任意日报可按 `r` 重新生成

快捷键：`↑↓` 导航 · `Enter` 打开 · `r` 重新生成 · `Esc/←` 返回 · `q` 退出

### CLI 模式

```bash
# 生成今日日报
ccreport -d 2026-03-27

# 强制重新生成
ccreport -d 2026-03-27 --force

# 只提取原始对话文本（不调用 Claude 摘要）
ccreport --raw

# 提取指定日期的原始文本
ccreport --raw -d 2026-03-27
```

## 日报示例

```
3/27: 5个项目 · 12个session · 主要推进 ccreport 初始化和 sailcode 权限重构

| 指标 | 值 |
|------|-----|
| 项目数 | 5 |
| Session 数 | 12 |
| 消息数 | 47 |
| 活跃时段 | 14:00-18:00, 22:00-01:00 |
| Focus | ~/Developer/ccreport (70%) |

## ~/Developer/ccreport
- 完成项目初始化：pnpm + TypeScript + Ink 配置
- 实现数据提取管道：history.jsonl 流式解析 + session JSONL 文本提取
- 实现 worktree session 归并逻辑
- 调研了 marked-terminal 的 Markdown 渲染方案

## ~/Developer/sailcode-team/app
- 修复了权限模块的角色继承 bug
- 重构了 middleware 的错误处理链路

  ### worktree: feature-auth-refactor
  - 在 worktree 中完成 OAuth2 集成的 spike
```

## 数据源

ccreport 读取 Claude Code 的本地数据（只读）：

- `~/.claude/history.jsonl` — 全局输入历史
- `~/.claude/projects/<encoded>/<sessionId>.jsonl` — 完整对话记录

日报存储在 `~/.ccreport/reports/YYYY-MM-DD.md`。

## 工作原理

1. 从 `history.jsonl` 中按日期过滤 session
2. 读取每个 session 的 JSONL，提取 user 和 assistant 的文本内容
3. 将 worktree session 归并到父项目
4. 计算元数据（Focus、活跃时段等）
5. 通过 `claude -p` 生成按项目分组的摘要
6. Token 超预算时自动按项目/session 分拆并行生成

## License

MIT
