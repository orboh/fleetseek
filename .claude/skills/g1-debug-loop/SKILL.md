# g1-debug-loop Skill

## Purpose

G1 デバッグセッション開始時に FleetSeek MCP から過去の解決策を自動取得し、セッション終了時に
知見を FleetSeek へ自動投稿する。これにより「同じ問題で二度ハマらない」ループを形成する。

- Robot target: Unitree G1 (`robot_model: "unitree_g1"`)
- MCP server: FleetSeek MCP (`packages/mcp-server/`)
- Required MCP tools: `experience_search`, `experience_post`, `experience_apply_intent`, `experience_apply_result`

---

## Trigger Conditions

このスキルを自動起動する条件:

1. ユーザーが以下のキーワードを含む作業を始めたとき:
   - 日本語: 「G1」「デバッグ」「エラー」「動かない」「失敗」「エラーコード」「接続できない」
   - 英語: "debug", "error", "oscillation", "timeout", "limit exceeded", "position error", "not moving", "SDK", "joint"
2. または明示的に `/g1-debug-loop` と入力されたとき

---

## Execution Steps

### Step 1: Identify Symptoms

ユーザーの問題説明から症状キーワードを抽出する。

- 自由記述から構造化キーワードを生成:
  - 例: "腕が振動する" → `"arm oscillation"`
  - 例: "トルク制限エラー" → `"torque limit exceeded"`
  - 例: "左肘が動かない" → `"left elbow joint position error"`
  - 例: "SDK接続できない" → `"Unitree SDK connection timeout"`
- キーワードは英語で 3〜6 語程度にまとめる

### Step 2: Search FleetSeek for Past Solutions

MCP ツール `experience_search` を呼ぶ。

```json
{
  "tool": "experience_search",
  "arguments": {
    "query": "<Step 1 で抽出した症状キーワード>",
    "type": "debug_note",
    "limit": 5
  }
}
```

### Step 3: Write Search Results to task_plan.md

検索結果がある場合、`task_plan.md` の**先頭**に以下のセクションを追記/挿入する。
既存の FleetSeek セクションがあれば上書きして最新化する。

```markdown
## FleetSeek Search Results (<ISO 8601 datetime>)

| ID | Title | trust_score | status |
|---|---|---|---|
| exp_xxx | G1 arm oscillation during pick task | 87 | canonical |
| exp_yyy | Joint position limit error on left elbow | 72 | human_reviewed |

### Top Match Summary
- **Root cause**: PD gain Kd too high for end-effector load
- **Resolution**: Reduce `kd_arm` from 0.8 to 0.4 in `config/wbc_params.yaml` [parameter_change]
- **human_required**: false
```

検索結果が 0 件の場合は以下を記載:

```markdown
## FleetSeek Search Results (<datetime>)

No matching past experiences found. Proceeding with fresh investigation.
```

### Step 4: Announce Apply Intent

`trust_score >= 50` の Experience が 1 件以上見つかった場合のみ実行する。
最も関連性の高い（trust_score が最高の）Experience を選び、適用予告を送る。

```json
{
  "tool": "experience_apply_intent",
  "arguments": {
    "experience_id": "<exp_xxx>"
  }
}
```

完了後にユーザーへ報告:
> "FleetSeek に適用予告を送信しました (experience_id: exp_xxx)。解決策を参照しながら作業を進めます。"

### Step 5: Debug Work

通常の Claude Code デバッグ作業を継続する。
参照した Experience の解決策を優先的に試みる。

### Step 6: Report Outcome and Offer to Post

ユーザーが「解決した」「直った」「fix した」「resolved」などと言ったとき、または
明示的に `/debug-harvest` を呼んだとき:

#### 6a. Report application result

```json
{
  "tool": "experience_apply_result",
  "arguments": {
    "experience_id": "<Step 4 で使った exp_id>",
    "outcome": "success",
    "outcome_notes": "<何が有効だったか一言>"
  }
}
```

Step 4 で `experience_apply_intent` を呼ばなかった場合（0 件ヒット）はスキップ。

#### 6b. Offer to post new DebugNote

以下のプロンプトを提示する:

> "この解決策を FleetSeek に投稿しますか？同じ問題で他の開発者が時間を節約できます。"
> "投稿する場合は「はい」と言うか `/debug-harvest` を実行してください。"

ユーザーが同意した場合は **DebugNote Post Format** セクションを参照して
`experience_post` を呼ぶ。

---

## DebugNote Post Format

`experience_post` に渡す JSON ペイロード:

```json
{
  "type": "debug_note",
  "title": "<問題の一言要約（英語推奨、50 文字以内）>",
  "tags": ["g1", "<症状カテゴリ: oscillation|joint_error|sdk|torque|vision|nav|other>"],
  "data": {
    "symptoms": {
      "observed_behavior": {
        "text": "<何が起きていたか（自由記述）>"
      },
      "error_messages": ["<エラーメッセージ文字列、なければ空配列>"],
      "conditions": {
        "task": "<作業内容: pick_place|walk|wbc_debug|sdk_test|etc>",
        "environment": "lab"
      }
    },
    "root_cause": {
      "category": "<parameter_change|code_patch|command_sequence|workflow|hardware_action>",
      "description": "<原因の説明>"
    },
    "resolution": {
      "type": "<parameter_change|code_patch|command_sequence|workflow|hardware_action>",
      "human_required": false,
      "changes": [
        {
          "description": "<変更内容の説明>",
          "value": "<具体的な値・コマンド・パッチ>"
        }
      ]
    },
    "failed_attempts": []
  },
  "applicability": {
    "robot_model": "unitree_g1",
    "task_context": "<作業コンテキスト>"
  }
}
```

### Field Guidelines

| Field | Rule |
|---|---|
| `resolution.type` | `parameter_change` / `code_patch` / `command_sequence` / `workflow` / `hardware_action` のいずれか |
| `resolution.human_required` | 自動適用可能なら `false`。物理作業が必要なら `true` |
| `trust_score` | 直接指定しない。API が `trust_signals` から自動計算する |
| `applicability.robot_model` | 常に `"unitree_g1"` |
| `status` | 投稿時は `"candidate"` から始まる（指定不要） |

---

## Stop Hook Behavior

Claude Code の Stop hook (`UserPromptSubmit` / session end) でトリガーされる動作:

- デバッグセッションが進行中で `experience_apply_intent` を呼んでいた場合、
  まだ `experience_apply_result` を送っていなければリマインダーを表示する:

> "デバッグセッションが終了しようとしています。結果を FleetSeek に報告しますか？
> 解決した場合: /debug-harvest
> 未解決の場合: experience_apply_result outcome='failure' で記録できます"

---

## Error Handling

| Situation | Action |
|---|---|
| MCP server not running | エラーを無視してデバッグ作業を継続。末尾に「FleetSeek MCP が接続されていないため検索をスキップしました」と添える |
| No results found | Step 3 に「No matching past experiences found」を記載して継続 |
| `experience_post` 失敗 | エラー内容をユーザーに提示し、JSON ペイロードをクリップボードに提示して手動投稿を促す |
| `trust_score < 50` のみヒット | Step 4 をスキップ。検索結果は task_plan.md に記載するが、「参考程度」と注記する |

---

## Related Files

- `packages/mcp-server/CLAUDE.md` — MCP ツール仕様
- `apps/api/CLAUDE.md` — Experience API エンドポイント
- `.claude/skills/g1-debug-loop/debug-harvest.md` — `/debug-harvest` コマンド詳細
- `.claude/rules/schema.md` — Experience スキーマルール
