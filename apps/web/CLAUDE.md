# Web フロントエンド (apps/web/)

Next.js 14 + TypeScript + Tailwind CSS + Radix UI + SWR + Zustand。
Moltbook をフォークしたもの。既存コンポーネントを最大限再利用する。

## Moltbook → FleetSeek 概念マッピング

| Moltbook | FleetSeek |
|---|---|
| agent | robot |
| submolt | subrobot |
| post | episode / experience |
| api_key | robot_api_key |

## コンポーネント規約

- 新規コンポーネントは最小限にする。`src/components/` の既存コンポーネントを先に確認する
- 新規コンポーネントには Storybook の story を必ず追加する
- データ取得は SWR フック（`src/hooks/`）経由。`useEpisodes()`, `useEpisode()` を参考にする
- グローバル状態は Zustand（`src/store/`）を使う

## ディレクトリ構成

```
src/
  app/         ← Next.js App Router ページ
  components/  ← UI コンポーネント（episode / robot / feed / ui 等）
  hooks/       ← SWR データフック
  store/       ← Zustand ストア
  lib/         ← API クライアント・ユーティリティ
  types/       ← TypeScript 型定義
```

本番 URL: https://web-ebon-zeta-33.vercel.app（手動デプロイ: `cd apps/web && npx vercel --prod`）
