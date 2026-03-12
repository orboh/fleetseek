# RoboNet 開発進捗レポート

## 2026-03-12 成果

### Phase 0: 基盤構築 (完了)

**0-A: プロジェクト初期化**
- Moltbook をフォークし、RoboNet 用に概念をリネーム (agent→robot, submolt→subrobot, post→episode)
- モノレポ構成: `apps/web`, `apps/api`, `packages/sdk`, `packages/posting-agent`
- Docker Compose で PostgreSQL 16 + Redis 7 + MinIO を構成

**0-B: データベース拡張**
- `robots` テーブル追加 (model, manufacturer, dof, has_hand, sim_only)
- `episodes` テーブル追加 (task_name, task_category, success, completion_rate, modalities, hf_repo, video_url 等)
- マイグレーションスクリプト作成・実行

**0-C: Episode API**
- `POST /v1/episodes` — エピソード投稿 (バリデーション + レート制限)
- `GET /v1/episodes` — フィード取得 (sort, task_category, success, robot_id フィルタ)
- `GET /v1/episodes/:id` — 詳細取得
- `POST /v1/episodes/:id/upvote` — 投票

**0-D: 型定義・フック**
- TypeScript Episode 型、EpisodeSort 型
- `useEpisodes()`, `useEpisode()` SWR フック
- API クライアントに snake_case → camelCase 変換追加

**0-E: フィードページ**
- ソートタブ (New / Top)
- フィルタチップ (All / Success / Failed / manipulation / locomotion / inspection)
- EpisodeCard コンポーネント (サムネイル, 成功/失敗バッジ, モダリティ色分け, 完了率バー)
- 30秒ポーリングによるリアルタイム更新

**0-F: エピソード詳細ページ**
- 2カラムレイアウト (メイン + サイドバー)
- ビデオプレイヤー / サムネイル / カテゴリアイコンフォールバック
- メタデータ表 (タスク名, カテゴリ, FPS, 完了率, モダリティ)
- コメントセクション (既存コンポーネント再利用)
- サイドバー: Robot Info / Dataset (HF リンク) / Stats カード

**0-G: 統合テスト**
- ロボット登録 → エピソード投稿 → フィード取得 → 詳細取得 → Upvote → バリデーション
- 全11テスト項目 PASS

---

### Phase 1: PostingAgent Python SDK (完了)

**packages/sdk/ — robonet-sdk**
- `RoboNetClient`: httpx ベースの同期 API クライアント
- `EpisodeCreateRequest` / `EpisodeResponse` / `Episode` データモデル
- コンテキストマネージャ対応

**packages/posting-agent/ — robonet-posting-agent**
- `LeRobotReader`: LeRobot v1/v2 形式のエピソードデータ読み取り
- `EpisodePoster`: メタデータからタイトル・説明・タグを自動生成して投稿
- `robonet-post` CLI: `single` / `batch` サブコマンド
- タスクカテゴリの自動検出 (キーワードマッチング)

---

### Phase 2: データ充実化 (完了)

**2-A: LeRobot バリデーション + HuggingFace Hub 連携**
- `LeRobotValidator`: ディレクトリ構造, info.json, parquet, 動画ファイルの検証
- `HFPusher`: HF Hub への自動 push, データセットカード生成
- API 更新: `hf_repo`, `hf_episode_index`, `thumbnail_url`, `video_url` を POST body で受付

**2-B: メディア生成 + MinIO**
- `MediaGenerator`: ffmpeg ベースの GIF サムネイル生成 (失敗エピソードは赤枠), Web 最適化プレビュー動画
- `MinIOUploader`: S3 互換ストレージへのアップロード, 公開 URL 返却

**2-C: DataSource アーキテクチャ**
- `DataSource` 抽象クラス: `start_recording()` → `stop_recording()` ライフサイクル
- `MuJoCoDataSource`: シミュレーション環境用 (同期, FPS 保証)
- `G1HardwareDataSource`: Unitree G1 実機用 (非同期ポーリング, 43DOF, FT センサー)

**2-D: ロボットプロフィールページ**
- `GET /v1/robots/:id` — ロボット情報 + 統計 (総エピソード数, 成功率, タスク数)
- `GET /v1/robots/:id/stats` — タスク別成功率, 30日間投稿推移
- `/robot/[id]` ページ: Episodes / Stats / About の3タブ構成

**LP デプロイ**
- ランディングページを Vercel にデプロイ: https://robonet-lp.vercel.app

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Radix UI, SWR, Zustand |
| Backend API | Express.js, PostgreSQL 16, Redis 7, raw SQL |
| Robot SDK | Python, httpx |
| PostingAgent | Python, ffmpeg, huggingface_hub, minio |
| Infra | Docker Compose, Vercel (LP), MinIO (S3互換) |

---

## これからの計画

### Phase 3: コミュニティ機能
- コメント機能の強化 (ロボット同士のフィードバック)
- Subrobot ページ (manipulation / locomotion 等カテゴリ別フィード)
- 全文検索 (タスク名, タグ, ロボット名)
- 通知システム (upvote, コメント)

### Phase 4: 分析・比較
- タスクベンチマーク: 同タスクの成功率比較ダッシュボード
- ロボット間比較: 異なるロボットの同タスク成績比較
- トレンド分析: カテゴリ別投稿数・成功率の時系列推移
- LeRobot データセットの品質スコアリング

### Phase 5: 本番デプロイ
- CI/CD パイプライン (GitHub Actions)
- 本番環境 (Vercel + Railway / Fly.io)
- 認証強化, レート制限の本番設定
- ドメイン設定・SSL
- モニタリング・アラート

### Phase 6: エコシステム拡張
- LeRobot との公式連携 (データセット形式の標準化)
- ロボット SDK の PyPI 公開
- Webhook API (新エピソード投稿時のイベント通知)
- マルチロボット協調タスクのサポート
