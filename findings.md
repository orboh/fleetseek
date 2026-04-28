# Findings & Decisions — FleetSeek DebugNote MVP-α

## Requirements (要件書より)

### Experience データモデル
- 基底: `id (exp_+ULID)`, `type (skill/debug_note)`, `robot_id`, `org_id`, `visibility`, `applicability`, `provenance`, `verification`, `trust_signals`, `usage_stats`, `status`
- SkillExperience: `task_specification`, `episode_data_ref`, 既存 Skill フィールド
- DebugExperience: `symptoms`, `root_cause`, `resolution`, `failed_attempts`
- `symptoms.observed_behavior.embedding` — pgvector で意味検索

### resolution.type の分岐
- `parameter_change` / `code_patch` / `command_sequence` / `workflow` / `hardware_action`
- `hardware_action` は常に `human_required: true`

### trust_signals
- Signal A: applications (適用結果 — 最重要)
- Signal B: ai_review (completeness/coherence/specificity/novelty)
- Signal C: human_signals (upvotes/downvotes/human_verifications/failed_applications)
- `trust_score` = weighted sum (weights 調整可)

### status 遷移
`candidate` → `ai_reviewed` / `flagged` → `human_reviewed` → `canonical`

### ロボット ID 3層
- L1: `rbt_` + ULID (不変)
- L2: 物理 fingerprint (シリアル・MAC・HW Rev)
- L3: ConfigSnapshot (可変・履歴管理)

### MVP-α スコープ
- DB スキーマ刷新 + Skill データ移行
- API: 投稿・検索・適用結果
- CLI: install.sh / auth login / robot register / session start
- MCP サーバー基本ツール
- g1-debug-loop スキル
- SDK 拡張

### MVP-α 含めないもの
AI Reviewer Worker, コメント/アップボート UI, ロボット間 DM, 公開テナント

---

## 既存コードベース調査結果 (Phase 1 完了)

### DB スキーマ (apps/api/scripts/schema.sql)
**テーブル一覧:**
- `agents` — ロボット/エージェントアカウント (UUID PK)
- `subrobots` — コミュニティ
- `posts` — 投稿 (汎用)
- `comments`, `votes`, `subscriptions`, `follows`
- `robots` — agents を拡張するロボット固有情報 (model/manufacturer/dof/has_hand/hand_model/sim_only)
- `episodes` — posts を拡張する LeRobot エピソード (task_name/task_category/success/completion_rate/lerobot_path 等)

**未存在 (新規作成が必要):**
- `experiences` テーブル (新 STI 基底)
- `config_snapshots` テーブル (L3)
- `experience_applications` テーブル (適用結果)
- pgvector 拡張 (`CREATE EXTENSION IF NOT EXISTS vector`)

**robots テーブルの現状**: L2/L3 フィールドなし。serial/MAC/hw_rev カラムの追加が必要。

**episodes テーブルの現状**: 既存データが移行対象。`post_id` FK で posts と結合している構造に注意 — Experience への移行では posts テーブルとの結合をどう扱うか設計が必要。

### 既存 SDK (packages/sdk/)
- Python: `RoboNetClient` クラス (`httpx` ベース、同期)
- API キー形式: `robonet_` プレフィックス
- メソッド: `get_me()`, `post_episode()`, `get_episode()`, `get_episodes()`, `upvote_episode()`
- **後方互換必須**: シグネチャ変更禁止

### 既存フロントエンド型定義 (apps/web/src/types/index.ts)
- `Episode` 型あり (postId/robotId/taskName/success 等)
- `Agent`, `Post`, `Comment`, `Subrobot` 等の Moltbook 遺産型あり
- `Experience`, `DebugExperience`, `SkillExperience` 型はまだない
- TypeScript ルール: `any` 禁止、Experience 型は `packages/sdk/` から import

### ルールファイル (.claude/rules/)
- `backward-compat.md`: `/api/skills`, `/api/episodes` のレスポンス形式を変えない
- `typescript.md`: `any` 禁止、Experience 型は packages/sdk/ から import

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| STI (Single Table Inheritance) for Experience | `type` カラム分岐 + JSONB でサブタイプ固有フィールド。横断検索・pgvector 検索がシンプル |
| embedding 対象: symptoms.observed_behavior.text | 「症状テキスト → DebugNote」がコアユースケース |
| resolution.changes は JSONB | type 別構造が異なるため。バリデーションはアプリ層で実施 |
| CLI robot register は stub 先行 | U1 (Unitree SDK 個体情報 API) 未確定。フロー確認を先に行う |
| MCP サーバーは TypeScript | packages/mcp-server が既存。Node.js ランタイムに統一 |

---

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| (なし) | — |

---

## Resources

- 要件定義書: `~/Documents/orboh-company-vault/01Human-desire/M2_Fleetseek/`
- 既存 DB スキーマ: `apps/api/scripts/schema.sql`
- 既存マイグレーション: `apps/api/scripts/003_notifications.sql`
- MCP サーバー: `packages/mcp-server/CLAUDE.md`
- Unitree SDK ドキュメント: https://support.unitree.com/home/en/G1_developer (U1 解決時に参照)
- 本番 URL: https://web-ebon-zeta-33.vercel.app

---

## 未確定事項

| ID | 項目 | 解決タイミング |
|---|---|---|
| U1 | Unitree SDK の個体情報取得 API | CLI Phase 6 着手時 |
| U2 | AI Reviewer の Claude API コスト | MVP-β 設計時 |
| U3 | 既存 Skill データ移行の具体手順 | Phase 2 (DB スキーマ確認後) |
| U4 | 既存 LP/フロントへの影響範囲 | Phase 1 (コードベース精査中) |
| U5 | trust_score 重み付けの初期値 | MVP-β リリース時 |
| U6 | 重複検知の embedding 類似度閾値 | 投稿データ蓄積後 |

*Update this file after every 2 view/browser/search operations*
