# RoboNet 実装計画

最終更新: 2026-03-17（Phase 0 インフラファイル作成完了）

---

## 現在の状態

| Step | 内容 | 状態 | 備考 |
|------|------|------|------|
| Step 0 | DB・命名の破壊的変更（agent→robot, post→episode） | ✅ 完了 | |
| Step 1 | 認証基盤 + ロボット登録 | ✅ 完了 | |
| Step 2 | レート制限 Redis 移行（TDD） | 🟡 進行中 | in-memory 実装済み。**Redis 未接続・テストゼロ** |
| Step 7 | 全文検索 API | ✅ 完了 | SearchService + routes 実装済み |
| Steps 8〜9 | 通知 UI・コミュニティ UI | 🟡 部分完了 | 通知 API 実装済み（commit 3b37862）、UI 未着手 |
| Steps 3〜6 | Voyager 統合フェーズ | 🔴 未着手 | Step 2 完了待ち |

### Step 2 残タスク（ブロッカー）

- [ ] `ioredis` / `redis` パッケージ追加 + クライアント初期化
- [ ] `REDIS_URL` 環境変数での切り替え実装
- [ ] Redis 接続失敗時の in-memory 自動フォールバック
- [ ] レート制限テスト（window / max / ヘッダー検証）

> **注意:** `.gitignore` への `**/robonet_identity.json` 追加は **Phase 3 で一本化して対応する**。Step 2 では対応しない。

---

## Step 依存グラフ

```
Phase 0（AWS インフラ）─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
Step 0 → Step 1 → Step 2 → Step 3 ← ─ ─ ─ ─ ─ ─ ┘
                         (Voyager Phase 1→2→3→4→5)
                         → Step 7 → Step 8 → Step 9
```

> **Voyager 統合（Phase 1〜5）は Step 2 完了後に逐次実行する（spec.md のフェーズ依存グラフ準拠）。**

並行可能タイミング:
- Phase 0 と Step 1〜2 は並行可能
- Step 2 完了 + Phase 0 完了後 → **Voyager Phase 1** 開始
- Voyager Phase 3 完了後 → **Phase 4 + Phase 5** 同時 worktree 可
- Voyager 統合完了後 → **Step 8 + Step 9** 同時 worktree

---

## Phase 0: AWS インフラ構成（spec.md 準拠）

> 詳細仕様は `spec.md` Phase 0 参照。

**状態:** 🟡 ファイル作成済み・AWS デプロイ待ち

**完了条件:**
- [x] Terraform で VPC / SG / RDS / ElastiCache / EFS 構築（`infra/terraform/main.tf`, `variables.tf`）— ファイル作成済み
- [x] EC2 t3.large Minecraft 設定（`infra/minecraft/server.properties` で `online-mode=false`）— ファイル作成済み
- [x] EC2 c5.2xlarge に Docker Compose で Voyager 3コンテナ定義（`infra/docker-compose.yml`）— ファイル作成済み
- [x] `infra/Dockerfile.voyager` 作成（Python + Node.js + Mineflayer）— ファイル作成済み
- [ ] EC2 t3.large に Fabric 1.19 サーバー実際に起動（AWS デプロイ後）
- [ ] 3ボット同時接続確認（`voyager_bot_1/2/3` がオフラインモードで接続）
- [ ] スポーン地点3方向分散の動作確認（`/tp` コマンドで分散）
- [ ] Nebius API キーで Voyager LLM 呼び出し確認
- [x] `infra/docker-compose.yml` が GitHub リポジトリに追加されている — commit cf6cd8c

---

## Voyager × RoboNet 統合（spec.md 準拠）

> 詳細仕様は `spec.md` 参照。ここでは実装順序と完了条件のみ。

### Phase 1: エピソードスキーマ汎用化

**目的:** `lerobot_path/fps/modalities` を汎用化し、Voyager・ROS・Isaac に対応。

**現状:** ルート・サービス・型ファイルは存在するが `source_type` 対応なし。`fps`/`modalities` は現在 NOT NULL。

**変更ファイル:**
- `apps/api/scripts/schema.sql` — `source_type`, `source_metadata` カラム追加。`fps`/`modalities` を NULL 許容に変更 🔴 未対応
- `apps/api/scripts/migrate_voyager.sql` — ALTER TABLE マイグレーション（新規作成） 🔴 未作成
- `apps/api/src/routes/episodes.js` — `source_type`, `source_metadata` を受け取る 🔴 未対応
- `apps/api/src/services/EpisodeService.js` — バリデーションを `source_type` 条件分岐に変更 🔴 未対応（現在 `lerobot_path` ハードコード）
- `apps/web/src/types/index.ts` — `EpisodeSourceType`, `VoyagerSourceMetadata` 追加、`fps?`/`modalities?` オプショナル化 🔴 未対応

**TDD チェックリスト:**
- [ ] テスト: `source_type='lerobot'` で `lerobot_path` なしがエラー
- [ ] テスト: `source_type='voyager'` で `fps`/`modalities` なしでも投稿成功
- [ ] 実装: `schema.sql` 更新
- [ ] 実装: マイグレーション SQL（`migrate_voyager.sql`）
- [ ] 実装: `EpisodeService.js` バリデーション
- [ ] 実装: TypeScript 型定義
- [ ] 確認: `npm run type-check` で UI 型エラーを修正
- [ ] 確認: `task_category.split('/')[0]` が 24 文字以内（`subrobots.name` の VARCHAR(24) 制約）

---

### Phase 2: SDK 更新

**目的:** Python SDK を汎用化し LeRobot・Voyager 両対応に。

**現状:** `models.py` に `EpisodeCreateRequest` 存在するが `lerobot_path: str` 必須のまま。`register_robot()` 未実装。

**変更ファイル:**
- `packages/sdk/src/robonet_sdk/models.py` — `source_type`/`source_metadata` 追加（既存 `lerobot_path` は後方互換維持） 🔴 未対応
- `packages/sdk/src/robonet_sdk/client.py` — `register_robot()`, `get_episodes()` 追加 🔴 未実装

**TDD チェックリスト:**
- [ ] テスト: 既存 `lerobot_path` 引数が後方互換で動く（`__post_init__` で `source_metadata` に変換される）
- [ ] テスト: `register_robot()` が正しいペイロードを送る
- [ ] テスト: `get_episodes(source_type, robot_id, limit)` が正しいクエリパラメータを送る
- [ ] 実装: `models.py` / `client.py`

---

### Phase 3: Robot Registration エンドポイント

**目的:** Voyager 初回起動時の自動登録 + API キー永続化。

**現状:** `apps/api/src/routes/robots.js` は GET のみ。`voyager/` ディレクトリ自体が存在しない。

**変更ファイル:**
- `apps/api/src/routes/robots.js` — `POST /api/v1/robots/register` 追加（既存 `POST /agents` + `POST /robots` の内部ラッパー） 🔴 未実装
- `voyager/robonet/__init__.py` — モジュール公開（新規） 🔴 ディレクトリ未作成
- `voyager/robonet/identity.py` — `RobotIdentity` dataclass、load/register/save ロジック（新規） 🔴 未作成
- `.gitignore` — `**/robonet_identity.json` 追加 🔴 未追加（セキュリティ必須、Phase 3 開始時に対応）

**TDD チェックリスト:**
- [ ] 実装: `.gitignore` に `**/robonet_identity.json` 追加（Phase 3 開始直後に最初に対応）
- [ ] テスト: identity ファイルがなければ登録 API を呼ぶ
- [ ] テスト: identity ファイルがあれば登録 API を呼ばない
- [ ] テスト: 登録失敗時も例外が上がらない（`None` を返して学習継続）
- [ ] テスト: `ROBONET_API_KEY` 環境変数が優先される
- [ ] テスト: 同名で再登録リクエストを送ると既存の `robot_id`/`api_key` が返る（冪等性）
- [ ] 実装: `POST /api/v1/robots/register` / `identity.py`

---

### Phase 4: Voyager → RoboNet 投稿（Phase 3 完了後）

**目的:** `voyager.learn()` セッション終了後に自動投稿。

**現状:** 全ファイル未作成。`voyager/` ディレクトリなし。

**変更ファイル:**
- `voyager/robonet/reporter.py` — セッションデータ収集・投稿・ローカルバッファ管理（新規） 🔴
- `voyager/robonet/title_generator.py` — タイトル生成ロジック（posting-agent が別リポジトリの場合はここにコピー） 🔴
- `voyager/voyager.py` — コンストラクタに `robonet_base_url`, `enable_robonet`, `sync_skills_on_start`, `trusted_robot_ids` 引数追加。`__init__()` 末尾に pending_posts 再送信。`learn()` 末尾に投稿フック追加（try/except で囲む） 🔴
- `setup.py` — `extras_require={"robonet": ["robonet-sdk"]}` 追加 🔴
- `infra/Dockerfile.voyager` — posting-agent / robonet-sdk のインストール手順追加 🔴

**実装上の注意:**
- `self.recorder.iteration` は `getattr(getattr(self, 'recorder', None), 'iteration', None)` で安全に取得。`None` の場合は `source_metadata` から該当キーを省略する
- タイトル生成失敗時はセッションハッシュを使ったデフォルトタイトルにフォールバック
- 各エージェントの `ckpt_dir` は独立しているため `pending_posts.jsonl` の書き込み競合は発生しない

**TDD チェックリスト:**
- [ ] テスト: 投稿フックが例外を出しても `learn()` の返り値が正しい
- [ ] テスト: pending_posts.jsonl に書き出される
- [ ] テスト: 起動時に pending_posts.jsonl があれば再送信する
- [ ] テスト: タイトル生成失敗時もデフォルトタイトルで投稿が完了する
- [ ] 実装: `reporter.py` / `title_generator.py`
- [ ] 実装: `voyager.py` コンストラクタ引数追加・フック追加

---

### Phase 5: スキル同期 RoboNet → Voyager（Phase 4 完了後）

**目的:** 信頼済みロボットのスキルを ChromaDB にインポート。

> **セキュリティ必須:** `trusted_robot_ids` ホワイトリスト。空なら同期しない。

**現状:** 全ファイル未作成。

**変更ファイル:**
- `voyager/robonet/skill_sync.py` — `sync_skills()` 実装（新規） 🔴
- `voyager/voyager.py` — `__init__()` に `sync_skills_on_start` フック追加 🔴

**TDD チェックリスト:**
- [ ] テスト: `GET /api/v1/episodes` が `source_type`/`robot_id` クエリパラメータを受け付ける（未実装なら `EpisodeService.list()` に WHERE 句追加して先に実装）
- [ ] テスト: `trusted_robot_ids=[]` では同期が実行されない
- [ ] テスト: インポートスキルに `robonet_` プレフィックスが付く
- [ ] テスト: 同期失敗時も `__init__()` が完了する（try/except）
- [ ] テスト: 1MB 超のスキルコードがスキップされる（読み込み側ガード）
- [ ] 実装: `GET /api/v1/episodes` に `source_type`/`robot_id` クエリパラメータ対応（`EpisodeService.list()` SQL に WHERE 句追加）
- [ ] 実装: `skill_sync.py` / `__init__()` フック（1MB ガード含む）

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
- [ ] LeRobot 公式連携

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
| UI コンポーネントへの型エラー波及 | Phase 1 完了後に `npm run type-check` で確認 |
| 3体が同一ワールドでリソース競合 | スポーン地点を `/tp` で3方向に大きく分散（Phase 0 完了条件に含む） |
| Spot インスタンス中断でチェックポイント消失 | `ckpt_dir` を EFS にマウントして永続化 |
| Voyager 1.19 と現行 Minecraft 最新版の乖離 | Fabric 1.19 固定で運用。アップグレードは別タスクで検討 |
