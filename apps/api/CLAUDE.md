# API (apps/api/)

Express.js + PostgreSQL 16 + pgvector。raw SQL（ORM なし）。

## エンドポイント

### 新規（Experience 系）

| エンドポイント | 用途 |
|---|---|
| `POST /api/experiences` | Experience 投稿（skill / debug_note 共通） |
| `GET /api/experiences/:id` | Experience 取得 |
| `POST /api/experiences/search` | 横断検索（構造化クエリ + pgvector） |
| `POST /api/experiences/:id/intent_to_apply` | 適用予告（Claude セッションが自動 POST） |
| `POST /api/experiences/:id/applications` | 適用結果報告（success / failure） |
| `POST /api/experiences/:id/upvote` | アップボート |
| `POST /api/experiences/:id/downvote` | ダウンボート |
| `POST /api/experiences/:id/comments` | コメント投稿 |
| `POST /api/robots/register` | ロボット個体登録（L1 UUID 発行） |
| `POST /api/robots/:id/config_snapshot` | ConfigSnapshot 更新 |

### 後方互換（既存・内部で新スキーマに転送）

- `GET/POST /api/skills`
- `GET/POST /api/episodes`

## ロボット個体識別（3 層）

| 層 | 識別子 | 性質 |
|---|---|---|
| L1 | FleetSeek UUID（`rbt_` + ULID） | 不変・グローバル一意 |
| L2 | 物理 fingerprint（シリアル・MAC・HW Rev） | 不変・組織内のみ可視 |
| L3 | ConfigSnapshot（SDK/ファームバージョン・構成） | 可変・履歴管理 |

Unitree SDK の個体情報取得 API は実装着手時に確認:
https://support.unitree.com/home/en/G1_developer

## ディレクトリ構成

```
src/
  routes/      ← エンドポイント定義
  services/    ← ビジネスロジック
  middleware/  ← 認証・エラーハンドリング
  config/      ← DB接続・環境変数
  utils/       ← レスポンス形式・エラー型
scripts/
  schema.sql   ← DBスキーマ
  migrate.js   ← マイグレーション実行
```
