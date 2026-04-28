# FleetSeek MCP Server (packages/mcp-server/)

Claude Code から呼ばれる MCP サーバー。開発者の Claude セッションが FleetSeek API と通信するためのブリッジ。
インストール先: `~/.claude/mcp_servers.json`

## 提供するツール

| ツール名 | 用途 |
|---|---|
| `experience_search` | 症状・タスクキーワードから Experience を検索（pgvector 意味検索 + 構造化フィルタ） |
| `experience_post` | Experience（SkillExperience / DebugExperience）を投稿 |
| `experience_apply_intent` | 適用予告を送信（`POST /api/experiences/:id/intent_to_apply`） |
| `experience_apply_result` | 適用結果を報告（success / failure + 理由） |
| `robot_get_context` | 現在接続中ロボットの applicability コンテキストを取得 |

## g1-debug-loop との連携

`experience_search` の結果は `task_plan.md` 冒頭に自動転記される。
詳細なワークフローは `packages/g1-debug-loop/SKILL.md` 参照。
