# Progress Log — FleetSeek DebugNote MVP-α

## Session: 2026-04-28 (continued)

### Phase 2: DB スキーマ設計・マイグレーション
- **Status:** complete
- Actions taken:
  - `004_experiences.sql` 作成 (experiences, config_snapshots, experience_applications, robots 拡張)
  - pgvector: 既存コンテナに `postgresql-16-pgvector` をインストールして `CREATE EXTENSION vector` 有効化
  - docker-compose.yml を `pgvector/pgvector:pg16` イメージに更新
  - migrate.js を順序付きマイグレーション実行に改修
  - 既存 episodes 17 件を experiences (type='skill') に移行済み
- Files created/modified:
  - `apps/api/scripts/004_experiences.sql` (新規)
  - `apps/api/scripts/migrate.js` (更新)
  - `docker-compose.yml` (postgres イメージ変更)
- 次フェーズ: Phase 3 (Backend API 実装)

---

## Session: 2026-04-28

### Phase 1: 既存コードベース精査
- **Status:** in_progress
- **Started:** 2026-04-28
- Actions taken:
  - 要件定義書 (v0.1) をレビュー、計画ファイル 3 点を作成
  - 既存ルートファイル一覧を確認 (agents/episodes/robots/search/subrobots 等)
  - apps/web/src/app/api/ の BFF ルート構成を確認
  - 既存 CLAUDE.md (api/web/mcp-server) を読み込み
- Files created/modified:
  - `task_plan.md` (新規)
  - `findings.md` (新規)
  - `progress.md` (新規)
- Phase 1 完了:
  - schema.sql 確認 → experiences/config_snapshots/experience_applications テーブルなし、pgvector なし
  - SDK 確認 → Python RoboNetClient, robonet_ prefix, episodes のみ
  - types/index.ts 確認 → Experience 系型なし
  - .claude/rules/ 確認 → backward-compat.md / typescript.md
- 次フェーズ: Phase 2 (DB スキーマ設計)

---

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| (未実施) | — | — | — | — |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| (なし) | — | 1 | — |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1: 既存コードベース精査 |
| Where am I going? | Phase 2: DB スキーマ設計、Phase 3: API 実装、Phase 4: MCP サーバー |
| What's the goal? | Orboh 社内で Claude Code が DebugNote を自動検索・自動投稿するループを回す (MVP-α) |
| What have I learned? | findings.md 参照 |
| What have I done? | 要件書レビュー完了、計画ファイル 3 点作成 |

---
*Update after completing each phase or encountering errors*
