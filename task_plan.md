# Task Plan: FleetSeek DebugNote / Experience 機能 MVP-α

## Goal
Orboh 社内で Claude Code が DebugNote を自動検索・自動投稿するループを回せる状態にする (MVP-α)。

## Current Phase
Phase 4

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
- [ ] SKILL.md 設計
- [ ] タスク開始時の `experience_search` 自動呼び出し
- [ ] `task_plan.md` 冒頭への検索結果自動転記
- [ ] Stop hook で `/debug-harvest` を促す仕組み
- [ ] `intent_to_apply` 自動 POST ロジック
- **Status:** pending

### Phase 6: CLI 基礎 (packages/cli/)
- [ ] `fleetseek auth login`
- [ ] `fleetseek robot register` (Unitree SDK 連携は U1 解決後)
- [ ] `fleetseek session start`
- [ ] `install.sh` スクリプト
- **Status:** pending

### Phase 7: SDK 拡張 (packages/sdk/)
- [ ] `client.experiences.*` 追加
- [ ] 既存 `client.skills.*`, `client.episodes.*` の後方互換維持
- **Status:** pending

### Phase 8: 統合テスト・ドキュメント
- [ ] ローカルでの E2E 動作確認
- [ ] API ドキュメント更新
- [ ] MCP サーバーのローカル動作確認
- **Status:** pending

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

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (なし) | — | — |

## Notes
- 未確定事項 U1 (Unitree SDK 個体情報 API) は CLI Phase 6 着手時に解決
- MVP-α には AI Reviewer Worker は含まない
- `trust_score` の重み付け (U5) は MVP-β で調整
- 既存コード確認結果は findings.md に記録する
