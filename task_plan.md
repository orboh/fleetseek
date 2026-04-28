# Task Plan: FleetSeek DebugNote / Experience 機能 MVP-α

## Goal
Orboh 社内で Claude Code が DebugNote を自動検索・自動投稿するループを回せる状態にする (MVP-α)。

## Current Phase
MVP-α 完了 (全 Phase 1–8 done)

## Phases

### Phase 1: 既存コードベース精査
- [x] 既存 DB スキーマ (schema.sql) の確認
- [x] 既存 API ルート全体の把握 (後方互換境界の特定)
- [x] 既存 SDK (packages/sdk/) の把握
- [x] 既存フロントエンド型定義・コンポーネントの確認
- [x] 未確定事項 U3/U4 の解像度を上げる
- **Status:** complete

### Phase 2: DB スキーマ設計・マイグレーション
- [x] `experiences` テーブル設計 (Experience 基底, STI + JSONB)
- [x] `debug_experiences` / `skill_experiences` → JSONB `data` カラム
- [x] `robots` テーブル拡張 (L2: serial_number/mac_address/hw_revision, L1: fleetseek_id)
- [x] `config_snapshots` テーブル (L3)
- [x] `experience_applications` テーブル (適用結果)
- [x] pgvector embedding カラム追加 (vector(1536), HNSW インデックス)
- [x] マイグレーションファイル作成 (`apps/api/scripts/004_experiences.sql`)
- [x] 既存 Skill データの移行スクリプト (episodes → experiences, 17 件移行済み)
- **Status:** complete

### Phase 3: Backend API 実装
- [x] `POST /api/experiences` — 投稿
- [x] `GET /api/experiences/:id` — 取得
- [x] `POST /api/experiences/search` — 横断検索 (ILIKE + trust_score 降順)
- [x] `POST /api/experiences/:id/intent_to_apply` — 適用予告
- [x] `POST /api/experiences/:id/applications` — 適用結果 + trust_score 自動更新
- [x] `POST /api/robots/register` — ロボット登録 (fleetseek_id 発行)
- [x] `POST /api/robots/:id/config_snapshot` — ConfigSnapshot 更新
- [x] 後方互換: `/api/skills`, `/api/episodes` → 既存ルート維持
- [ ] embedding 生成ロジック (症状テキスト → vector) ← MVP-β に延期
- **Status:** complete (embedding は MVP-β)

### Phase 4: MCP サーバー実装 (packages/mcp-server/)
- [x] `experience_search` ツール
- [x] `experience_post` ツール
- [x] `experience_apply_intent` ツール
- [x] `experience_apply_result` ツール
- [x] `robot_get_context` ツール (MVP-α stub)
- [x] `~/.claude/mcp_servers.json` への登録完了
- **Status:** complete

### Phase 5: g1-debug-loop スキル
- [x] SKILL.md 設計 (`.claude/skills/g1-debug-loop/SKILL.md`)
- [x] タスク開始時の `experience_search` 自動呼び出し手順
- [x] `task_plan.md` 冒頭への検索結果自動転記ルール
- [x] `/debug-harvest` コマンド仕様 (`debug-harvest.md`)
- [x] `intent_to_apply` 自動 POST ロジック
- [x] シードデータ 3 件投入済み (arm oscillation / joint limit / SDK timeout)
- **Status:** complete

### Phase 6: CLI 基礎 (packages/cli/)
- [x] `fleetseek auth login` (conf で ~/.config/fleetseek/config.json 保存)
- [x] `fleetseek robot register` (fleetseek_id を config に保存)
- [x] `fleetseek session start` (FLEETSEEK_ROBOT_ID 設定手順を表示)
- [x] `fleetseek search <query>` (--type フィルタ付き ASCII テーブル表示)
- [x] `install.sh` スクリプト
- OSS 採用: commander v14 / @inquirer/prompts v7 / conf v13
- **Status:** complete

### Phase 7: SDK 拡張 (packages/sdk/)
- [x] `client.experiences.*` 7 メソッド追加
- [x] 既存 `client.skills.*`, `client.episodes.*` の後方互換維持
- **Status:** complete

### Phase 8: 統合テスト・ドキュメント
- [x] ローカルでの E2E 動作確認
- [x] API ドキュメント更新 (skill.md / README.md / CLAUDE.md)
- [x] MCP サーバーのローカル動作確認
- **Status:** complete

## Key Questions
1. 既存 `experiences` テーブルはすでに存在するか? (schema.sql 確認要)
2. `robots` テーブルに L2/L3 フィールドがあるか?
3. pgvector は現在の DB で有効化済みか?
4. SDK は何言語? Python のみ?
5. 既存 Skill データは何件あるか? (移行コスト見積もり)
6. Unitree SDK で個体情報取得する API (U1) — CLI の robot register は stub で先行実装するか?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Experience をシングルテーブル継承 (STI) で実装 | `type` カラムで分岐、サブタイプ固有フィールドは JSONB — シンプル + 横断検索が容易 |
| embedding は symptom.observed_behavior.text を対象 | 検索の主ユースケースが「症状テキスト → DebugNote」のため |
| CLI robot register は U1 解決前は stub 実装 | Unitree SDK API 未確定のため、フロー確認を優先 |
| 後方互換 API は内部転送 (リダイレクトなし) | SDK の URL ハードコードを避けるため |

## E2E Test Results (Phase 8 — 2026-04-28)
| Test | Status |
|------|--------|
| POST /experiences (debug_note) | PASS |
| GET /experiences/:id | PASS |
| POST /experiences/search | PASS |
| POST intent_to_apply | PASS |
| POST applications (trust_score 更新) | PASS |
| POST /robots/register | PASS |
| POST /robots/:id/config_snapshot | PASS |
| GET /episodes (backward compat) | PASS |
| MCP experience_search | PASS |
| MCP experience_post | PASS |
| MCP experience_apply_intent | PASS |
| MCP experience_apply_result | PASS |
| MCP robot_get_context | PASS |

## Bugs Fixed During Testing
| Bug | File | Fix |
|-----|------|-----|
| tags JSON.stringify で malformed array | experiences.js:76 | `tags \|\| null` |
| applicability/provenance/data null 制約違反 | experiences.js:77-79 | `JSON.stringify(x \|\| {})` |
| robots INSERT に updated_at/ON CONFLICT が不整合 | robots.js | 当該句を削除 |
| MCP レスポンスパース `data.data.X` が誤り | mcp-server/index.ts | `data.X` に修正 + rebuild |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| ulid module missing | 1 | `cd apps/api && npm install ulid` |
| port 5432 conflict | 1 | robonet-postgres-1 が既に起動中、そのまま使用 |
| port 3001 EADDRINUSE | 1 | `fuser -k 3001/tcp` でクリア |

## Notes
- 未確定事項 U1 (Unitree SDK 個体情報 API) は CLI Phase 6 着手時に解決
- MVP-α には AI Reviewer Worker は含まない
- `trust_score` の重み付け (U5) は MVP-β で調整
- 既存コード確認結果は findings.md に記録する
