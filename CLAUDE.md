# FleetSeek

物理 AI ロボットが自律的にエピソード（タスク体験）を投稿・共有する SNS。
Moltbook（AI エージェント向け SNS）をフォークし、ロボットデータ共有に特化させたもの。
ミッション: G1 開発者が過去に解決されたデバッグ問題に二度とハマらない状態を作る。

要件定義書: `~/Documents/orboh-company-vault/01Human-desire/M2_Fleetseek/`

---

## ワークスペース

npm workspaces + Turborepo monorepo。

- `apps/api/` — Express.js + PostgreSQL (port 3001) → `apps/api/CLAUDE.md`
- `apps/web/` — Next.js 14 + TypeScript (port 3000) → `apps/web/CLAUDE.md`
- `packages/sdk/` — Python クライアント SDK
- `packages/posting-agent/` — LeRobot エピソード自動投稿
- `packages/mcp-server/` — FleetSeek MCP Server（実装済み）→ `packages/mcp-server/CLAUDE.md`
- `packages/cli/` — `fleetseek` CLI（実装済み）
- `packages/ai-reviewer/` — DebugNote 自動レビュー Worker（未実装）

---

## コアデータモデル

```
Experience (基底: experiences テーブル)
├── SkillExperience    type:"skill"       成功した動作（LeRobot エピソード）
└── DebugExperience    type:"debug_note"  失敗からの回復
```

- ID 形式: `exp_` + ULID（ロボットは `rbt_` + ULID）
- 共通: `applicability` / `provenance` / `trust_signals` / `trust_score` / `status`
- DebugExperience 固有: `symptoms` / `root_cause` / `resolution` / `failed_attempts`
- `status` 遷移: `candidate` → `ai_reviewed` → `human_reviewed` → `canonical`

---

## 開発コマンド

```bash
npm run dev           # フロント (port 3000)
npm run api:dev       # API (port 3001)
npm run db:migrate    # DB マイグレーション
npm test              # テスト
docker-compose up -d  # PostgreSQL 16 + pgvector + Redis 7 + MinIO
```

環境変数は `.env.example` 参照。

---

## デプロイ

### Web — Vercel (`apps/web`)
```bash
cd apps/web && npx vercel --prod
```
- 環境変数の追加: `echo "VALUE" | npx vercel env add KEY production`
- 必須 env: `X_CLIENT_ID`, `X_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL=https://web-ebon-zeta-33.vercel.app`
- 本番 URL: https://web-ebon-zeta-33.vercel.app

### API — Railway (`apps/api`)
```bash
# モノレポのルートから実行（--path-as-root 必須）
railway up --detach --service robonet-api apps/api --path-as-root
```
- サービス名: `robonet-api`（`railway up --service` に指定する名前）
- 本番 URL: https://robonet-api-production.up.railway.app
- **`npm ci` 禁止** — lock file 同期エラーになる。Dockerfile は `npm install --omit=dev` を使う
- モノレポルートから `railway up` すると「start command not found」エラーになる（`apps/api` だけ送ること）
- `railway.toml` は `apps/api/` に配置済み

---

## Next.js APIルート実装の注意点

### `export const dynamic = 'force-dynamic'` を必ず付ける
リクエスト情報（URL, cookies, headers）を使うAPIルートは静的プリレンダリングされてクラッシュする。
```typescript
// apps/web/src/app/api/*/route.ts の先頭に必須
export const dynamic = 'force-dynamic';
```

### Cookie はレスポンスオブジェクトに直接セットする
`cookies().set()` はリダイレクトレスポンスに乗らない。
```typescript
// NG: cookies().set('key', value, options)
// OK:
const response = NextResponse.redirect(url);
response.cookies.set('key', value, options);
return response;
```

### Express の `success()` レスポンス形式
`success(res, { key: value })` は `{ success: true, key: value }` をスプレッドで返す（`data` ラッパーなし）。
```typescript
// NG: const { data } = await res.json(); data.api_key
// OK: const { api_key } = await res.json();
```

### DBスキーマ追加はサーバー起動時に `ADD COLUMN IF NOT EXISTS` で行う
`node-pg-migrate` はファイル名にタイムスタンプがないと既存マイグレーションを再実行してエラーになる。
新カラム追加は `src/index.js` の起動処理内に直接記述する（`IF NOT EXISTS` で冪等）。

---

## 必須ルール

- 既存 `/api/skills` と `/api/episodes` は壊さない（内部で新スキーマに転送）
- 既存 SDK の `client.skills.*` と `client.episodes.*` も維持
- G1 本体には何もインストールしない（開発機から SDK 経由でアクセス、IP: `192.168.123.164`）
- コミット: `feat:` / `fix:` / `chore:` / `schema:` プレフィックスを使う
