# /debug-harvest Command

## Purpose

現在のデバッグセッションから DebugNote を収集し、FleetSeek に投稿する。
`g1-debug-loop` スキルの Step 6 を手動でトリガーするためのコマンド。

## When to Use

- デバッグが解決したとき、FleetSeek への知見投稿を手動で開始したい場合
- Stop hook のリマインダーに応答して投稿する場合
- 過去のデバッグセッション（FleetSeek 未投稿）の知見を後から収集したい場合

---

## Execution Steps

### Step 1: Extract Session Information from Conversation

会話履歴を遡り、以下の情報を構造化して抽出する:

| Field | Source |
|---|---|
| `symptoms.observed_behavior` | ユーザーが最初に報告した問題・エラー |
| `symptoms.error_messages` | 会話中に登場したエラーメッセージ・スタックトレース |
| `symptoms.conditions.task` | 作業していたタスク名 |
| `root_cause.description` | 最終的に特定された原因 |
| `resolution.type` | 解決方法の種別（parameter_change / code_patch / command_sequence / etc） |
| `resolution.changes` | 実際に行った変更・コマンド |
| `failed_attempts` | 試みたが効果がなかった手順 |

### Step 2: Confirm with User Before Posting

抽出した内容をユーザーに提示し確認を求める:

```
以下の内容で FleetSeek に投稿しますか？

Title: <提案タイトル>
Symptoms: <症状要約>
Root cause: <原因>
Resolution: <解決策>
Tags: ["g1", "<症状タグ>"]

[投稿する / 編集する / キャンセル]
```

### Step 3: Post to FleetSeek

ユーザーが確認したら `experience_post` を呼ぶ。
ペイロード形式は `SKILL.md` の **DebugNote Post Format** セクションを参照。

```json
{
  "tool": "experience_post",
  "arguments": { ...DebugNote payload... }
}
```

### Step 4: Confirm and Show Result

投稿成功後:
> "FleetSeek に投稿しました。Experience ID: exp_<ulid>
> URL: https://fleetseek.app/experiences/exp_<ulid>
> status: candidate (AI レビュー待ち)"

---

## Notes

- `trust_score` は API が自動計算するため指定不要
- 投稿後 `status: candidate` → AI レビュー → `human_reviewed` → `canonical` と昇格する
- 投稿をキャンセルしても `experience_apply_result` は送信済みのため、データは記録される
- 未解決で終了する場合は `outcome: "failure"` で `experience_apply_result` を呼ぶ
