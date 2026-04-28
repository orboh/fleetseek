---
paths:
  - "apps/api/src/routes/**"
  - "packages/sdk/**"
---

# 後方互換ルール

- `GET/POST /api/skills` と `GET/POST /api/episodes` のレスポンス形式を変えない
- 既存エンドポイントを削除・リネームしない。新エンドポイントは `/api/experiences/` 以下に追加する
- Python SDK の `client.skills.*` と `client.episodes.*` のシグネチャを変えない
- 既存テストが通ることを確認してからマージする
