---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript ルール

- `any` 禁止。必ず具体的な型定義を書く
- Experience / SkillExperience / DebugExperience の型は `packages/sdk/` の定義を import して使う
- API レスポンスの snake_case → camelCase 変換は既存の API クライアントユーティリティを使う
