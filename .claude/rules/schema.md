---
paths:
  - "apps/api/**"
---

# Experience スキーマルール

- `applicability` フィールドは構造化必須。自然言語のみの条件は禁止
- `resolution.type` の分岐（parameter_change / code_patch / command_sequence / workflow / hardware_action）は LLM なしで機械判定できる粒度を保つ
- `resolution.human_required: true` の場合、AI Agent は自動適用せずエスカレーション
- `trust_score` は直接書き込まず、trust_signals から自動計算する
- DB カラム追加時は必ずマイグレーションファイルを `apps/api/scripts/` に作成する
