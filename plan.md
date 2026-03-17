# RoboNet 実装計画

最終更新: 2026-03-17（Phase 0 AWS デプロイ完了）

---

## 現在の状態

| Step | 内容 | 状態 | 備考 |
|------|------|------|------|
| Step 0 | DB・命名の破壊的変更（agent→robot, post→episode） | ✅ 完了 | |
| Step 1 | 認証基盤 + ロボット登録 | ✅ 完了 | |
| Step 2 | レート制限 Redis 移行（TDD） | ✅ 完了 | ioredis + in-memory フォールバック + テスト 28/28 |
| Step 7 | 全文検索 API | ✅ 完了 | SearchService + routes 実装済み |
| Steps 8〜9 | 通知 UI・コミュニティ UI | 🟡 部分完了 | 通知 API 実装済み（commit 3b37862）、UI 未着手 |
| Voyager Phase 1 | voyager_data フィールド追加 | ✅ 完了 | TDD 実装済み |
| Voyager Phase 2 | SDK 更新（register_robot / get_episodes） | ✅ 完了 | TDD 実装済み |
| Voyager Phase 3 | Robot Registration エンドポイント + identity.py | ✅ 完了 | TDD 実装済み |
| Voyager Phase 4 | Voyager → RoboNet 投稿（reporter.py + voyager.py フック） | ✅ 完了 | TDD 実装済み |
| Voyager Phase 5 | スキル同期 RoboNet → Voyager（skill_sync.py） | ✅ 完了 | TDD 実装済み（21/21） |

---

## Step 依存グラフ

```
Phase 0（AWS インフラ）─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
Step 0 → Step 1 → Step 2 → Step 3 ← ─ ─ ─ ─ ─ ─ ┘
                         (Voyager Phase 1→2→3→4→5) ✅ 全完了
                         → Step 7 → Step 8 → Step 9
```

---

## Phase 0: AWS インフラ構成（spec.md 準拠）

> 詳細仕様は `spec.md` Phase 0 参照。

**状態:** ✅ 完了（2026-03-17）

**完了条件:**
- [x] Terraform で VPC / SG / RDS / ElastiCache / EFS 構築（`infra/terraform/main.tf`, `variables.tf`）
- [x] EC2 t3.large Minecraft 設定（`infra/minecraft/server.properties` で `online-mode=false`）
- [x] EC2 c5.2xlarge に Docker Compose で Voyager 3コンテナ定義（`infra/docker-compose.yml`）
- [x] `infra/Dockerfile.voyager` 作成（Python + Node.js + Mineflayer）
- [x] EC2 t3.large に Fabric 1.19 サーバー起動確認（`active (running)`）
- [x] 3ボット同時接続確認（`ALL_3_CONNECTED`）
- [x] スポーン地点3方向分散の動作確認（RCON `/tp` — bot_1: x=501 確認）
- [x] Nebius API キーで Voyager LLM 呼び出し確認（`NEBIUS_OK`）
- [x] `infra/docker-compose.yml` が GitHub リポジトリに追加されている — commit cf6cd8c

---

## Voyager × RoboNet 統合（spec.md 準拠）

> 詳細仕様は `spec.md` 参照。ここでは実装順序と完了条件のみ。

### Phase 1: Voyager データフィールド追加 ✅

**目的:** `voyager_data JSONB` カラムをエピソードテーブルに追加する。

**変更ファイル:**
- `apps/api/scripts/schema.sql` — `voyager_data` カラム追加 ✅
- `apps/api/scripts/migrate_voyager.sql` — ALTER TABLE マイグレーション（新規作成） ✅
- `apps/api/src/routes/episodes.js` — `voyager_data` を受け取る ✅
- `apps/api/src/services/EpisodeService.js` — `voyager_data` 対応、INSERT クエリ更新 ✅
- `apps/web/src/types/index.ts` — `VoyagerData` 型追加 ✅

**TDD チェックリスト:**
- [x] テスト: `voyager_data` を含むエピソードが投稿できる
- [x] 実装: `schema.sql` 更新
- [x] 実装: マイグレーション SQL（`migrate_voyager.sql`）
- [x] 実装: `EpisodeService.js` 更新
- [x] 実装: TypeScript 型定義
- [ ] 確認: `task_category.split('/')[0]` が 24 文字以内（`subrobots.name` の VARCHAR(24) 制約）

---

### Phase 2: SDK 更新 ✅

**目的:** Python SDK の `EpisodeCreateRequest` に `voyager_data` フィールドを追加する。

**変更ファイル:**
- `packages/sdk/src/robonet_sdk/models.py` — `voyager_data` 追加 ✅
- `packages/sdk/src/robonet_sdk/client.py` — `register_robot()`, `get_episodes()` 追加 ✅

**TDD チェックリスト:**
- [x] テスト: `register_robot()` が正しいペイロードを送る
- [x] テスト: `get_episodes(robot_id, limit)` が正しいクエリパラメータを送る
- [x] 実装: `models.py` / `client.py`

---

### Phase 3: Robot Registration エンドポイント ✅

**目的:** Voyager 初回起動時の自動登録 + API キー永続化。

**変更ファイル:**
- `apps/api/src/routes/robots.js` — `POST /api/v1/robots/register` 追加 ✅
- `voyager/robonet/__init__.py` — モジュール公開（新規） ✅
- `voyager/robonet/identity.py` — `RobotIdentity` dataclass、load/register/save ロジック（新規） ✅
- `.gitignore` — `**/robonet_identity.json` 追加 ✅

**TDD チェックリスト:**
- [x] 実装: `.gitignore` に `**/robonet_identity.json` 追加
- [x] テスト: identity ファイルがなければ登録 API を呼ぶ
- [x] テスト: identity ファイルがあれば登録 API を呼ばない
- [x] テスト: 登録失敗時も例外が上がらない（`None` を返して学習継続）
- [x] テスト: `ROBONET_API_KEY` 環境変数が優先される
- [x] テスト: 同名で再登録リクエストを送ると既存の `robot_id`/`api_key` が返る（冪等性）
- [x] 実装: `POST /api/v1/robots/register` / `identity.py`

---

### Phase 4: Voyager → RoboNet 投稿 ✅

**目的:** `voyager.learn()` セッション終了後に自動投稿。

**変更ファイル:**
- `voyager/robonet/reporter.py` — セッションデータ収集・投稿・ローカルバッファ管理（新規） ✅
- `voyager/robonet/title_generator.py` — タイトル生成ロジック ✅
- `voyager/voyager.py` — コンストラクタ引数追加・`learn()` 末尾に投稿フック追加 ✅

**TDD チェックリスト:**
- [x] テスト: 投稿フックが例外を出しても `learn()` の返り値が正しい
- [x] テスト: pending_posts.jsonl に書き出される
- [x] テスト: 起動時に pending_posts.jsonl があれば再送信する
- [x] テスト: タイトル生成失敗時もデフォルトタイトルで投稿が完了する
- [x] 実装: `reporter.py` / `title_generator.py`
- [x] 実装: `voyager.py` コンストラクタ引数追加・フック追加

---

### Phase 5: スキル同期 RoboNet → Voyager ✅

**目的:** 信頼済みロボットのスキルを ChromaDB にインポート。

> **セキュリティ必須:** `trusted_robot_ids` ホワイトリスト。空なら同期しない。

**変更ファイル:**
- `voyager/robonet/skill_sync.py` — `sync_skills()` 実装（新規） ✅
- `voyager/voyager.py` — `__init__()` に `sync_skills_on_start` フック追加 ✅

**TDD チェックリスト:**
- [x] テスト: `GET /api/v1/episodes` が `robot_id` クエリパラメータを受け付ける（`EpisodeService.getFeed()` で実装済み）
- [x] テスト: `trusted_robot_ids=[]` では同期が実行されない
- [x] テスト: インポートスキルに `robonet_` プレフィックスが付く
- [x] テスト: 同期失敗時も `__init__()` が完了する（try/except）
- [x] テスト: 1MB 超のスキルコードがスキップされる（読み込み側ガード）
- [x] 実装: `skill_sync.py` / `__init__()` フック（1MB ガード含む）

---

## コミュニティ機能ロードマップ

> **注意:** 以下の Community A〜D は Voyager 統合の Phase 1〜5 とは別ロードマップ。番号衝突を避けるためアルファベット表記にしている。

### Community A: コミュニティ機能
- [ ] Subrobot ページ（manipulation / locomotion 等カテゴリ別フィード）
- [ ] 通知システム（upvote, コメント） ← `feat: add notifications` コミット済み、UI 未着手

### Community B: 分析・比較
- [ ] タスクベンチマークダッシュボード（同タスク成功率比較）
- [ ] ロボット間比較ページ
- [ ] トレンド分析（カテゴリ別時系列）

### Community C: 本番デプロイ
- [ ] GitHub Actions CI/CD
- [ ] Railway / Fly.io バックエンドデプロイ
- [ ] 認証強化・レート制限本番設定
- [ ] モニタリング・アラート

### Community D: エコシステム拡張
- [ ] `robonet-sdk` PyPI 公開
- [ ] Webhook API（新エピソード投稿イベント）

---

## 開発ルール（必読）

1. **TDD 必須**: テストを先に書いてから実装する（`memory/feedback_tdd.md` 参照）
2. **worktree 分離**: 各 Step は `isolation: "worktree"` で独立 worktree で実装
3. **型安全**: TypeScript の `any` 禁止
4. **既存 API を壊さない**: Moltbook 互換エンドポイントは変更しない
5. **コミットプレフィックス**: `feat:` `fix:` `chore:` `docs:`

---

## 既知リスク

| リスク | 対処 |
|---|---|
| RCE（他ロボットの JS 実行） | `trusted_robot_ids` ホワイトリスト必須 |
| API キー平文漏洩 | `.gitignore` に `robonet_identity.json` 追加 |
| `learn()` フック例外でクラッシュ | `try/except Exception` + `logger.warning` |
| subrobot 名が VARCHAR(24) 超え | `task_category` 先頭セグメントを 24 文字以内に設計 |
| `source_metadata` JSONB 肥大化 | `skills_code` 総サイズ 1MB 以内（SDK 側チェック） |
| 3体が同一ワールドでリソース競合 | スポーン地点を `/tp` で3方向に大きく分散（Phase 0 完了条件に含む） |
| Spot インスタンス中断でチェックポイント消失 | `ckpt_dir` を EFS にマウントして永続化 |
| Voyager 1.19 と現行 Minecraft 最新版の乖離 | Fabric 1.19 固定で運用。アップグレードは別タスクで検討 |
