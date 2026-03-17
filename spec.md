# RoboNet × Voyager 統合仕様

## 概要

Voyager（Minecraft LLM 終身学習エージェント）と RoboNet（ロボット学習エピソード共有 SNS）を双方向に統合する。

**統合の方向:**
- **Voyager → RoboNet**: `voyager.learn()` セッション終了時に自動投稿
- **RoboNet → Voyager**: 信頼済みロボットのスキルを Voyager の ChromaDB に同期

**投稿粒度:** 1 `voyager.learn()` セッション = 1エピソード

---

## コンセプトマッピング

| Voyager | RoboNet | 備考 |
|---|---|---|
| `voyager.learn()` セッション | episode | 1セッション = 1投稿 |
| 習得スキル (`skills.json`) | `source_metadata.skills_acquired` | スキル名のリスト |
| スキルコード (JS) | `source_metadata.skills_code` | 同期対象 |
| 完了タスク | `source_metadata.tasks_completed` | |
| `ckpt_dir/` | `source_metadata.ckpt_dir` | 参照パス |
| Voyager インスタンス | robot (1台 = 1アカウント) | UUID は RoboNet が発行 |

---

## フェーズ依存関係

```
Phase 0（AWS インフラ）─────────────────────────────────┐
Phase 1（スキーマ汎用化）                               │
    └─→ Phase 2（SDK 更新）                             │
            ├─→ Phase 3（Robot Registration）← ─ ─ ─ ─┘
            └─→ Phase 4（Voyager → RoboNet 投稿）← Phase 3
                    └─→ Phase 5（スキル同期）
```

Phase 0 は Phase 1 と並行して進められる。Phase 3 の実装開始前に完了が必要。

---

## Phase 0: AWS インフラ構成

> Voyager は RoboNet の動作確認用。On-Demand EC2 + Docker named volume 構成。

### MVP 構成

**Minecraft サーバー**
- ソフト: **Fabric サーバー 1.19**（Paper 不可。Voyager が Fabric Mod に依存するため）
- インスタンス: EC2 **t3.large** (Ubuntu 22.04, ap-northeast-1)
- ボットアカウント: オフラインモード（`online-mode=false`）
- 3体のボットが同一ワールドに接続。スポーン地点を `/tp` で3方向に大きく分散させリソース競合を回避

**Voyager エージェント**
- インスタンス: EC2 **c5.2xlarge** (Ubuntu 22.04) — On-Demand
- 管理: **Docker Compose** で API + 3コンテナを同一ホストに同居
- 各コンテナの設定差分:

```yaml
voyager-1:
  environment:
    BOT_USERNAME: voyager_bot_1
    CKPT_DIR: /ckpt/agent-1        # 必ず分離する（spec 制約）
    MINECRAFT_HOST: ${MINECRAFT_HOST}  # Minecraft EC2 のプライベートIP
    NEBIUS_BASE_URL: ${NEBIUS_BASE_URL}
    NEBIUS_API_KEY: ${NEBIUS_API_KEY}
    ROBONET_BASE_URL: http://api:3001/api/v1
  volumes:
    - ckpt_agent1:/ckpt/agent-1    # Docker named volume（EBS 上に永続化）

voyager-2:
  environment:
    BOT_USERNAME: voyager_bot_2
    CKPT_DIR: /ckpt/agent-2
    MINECRAFT_HOST: ${MINECRAFT_HOST}
  volumes:
    - ckpt_agent2:/ckpt/agent-2

voyager-3:
  environment:
    BOT_USERNAME: voyager_bot_3
    CKPT_DIR: /ckpt/agent-3
    MINECRAFT_HOST: ${MINECRAFT_HOST}
  volumes:
    - ckpt_agent3:/ckpt/agent-3
```

> **ckpt の永続性:** Docker named volume は EC2 の EBS 上に保存される。`docker compose down`（`-v` なし）や EC2 stop/start では消えない。EC2 terminate 時のみ消失するため、On-Demand 運用では実用上問題なし。

**LLM API**
- **Nebius**（OpenAI 互換）を使用。`openai_api_key` と `openai_api_base` を環境変数で差し替えるだけで対応可能
- Voyager コード上は `--openai_api_key` / `--openai_api_base` 引数で渡す

**RoboNet バックエンド（同一 VPC 内）**
- RDS PostgreSQL 15: db.t3.medium
- ElastiCache Redis 7: cache.t3.micro

### VPC 設計（MVP）

```
VPC: 10.0.0.0/16 (ap-northeast-1)

Public Subnet  (10.0.1.0/24): Minecraft EC2
Private Subnet (10.0.2.0/24): Voyager EC2（API + Voyager コンテナ同居）、RDS、Redis

Security Groups:
  sg-minecraft : inbound 25565/TCP from sg-voyager
  sg-voyager   : inbound 22/TCP from 管理者IP (SSM 推奨)
                 inbound 3001/TCP from 管理者IP（API 直接アクセス）
  sg-rds       : inbound 5432/TCP from sg-voyager（API が同居のため）
  sg-redis     : inbound 6379/TCP from sg-voyager（API が同居のため）
```

### robonet_identity.json の保存パス（MVP）

```
/ckpt/agent-1/robonet_identity.json  ← Docker named volume（EBS）
/ckpt/agent-2/robonet_identity.json
/ckpt/agent-3/robonet_identity.json
```

コンテナ再起動後も identity が保持されるため、再登録は発生しない。

### POST /robots/register の name 一意性

`name` フィールドは `voyager_<hostname>_<index>` 形式で一意性を保証する。
同名での再登録リクエストが来た場合は既存の `robot_id` / `api_key` を返す（重複登録しない）。

---

## Phase 1: Voyager データフィールド追加

### 目的

Voyager のセッションデータを保存する `voyager_data` カラムをエピソードテーブルに追加する。

### DB スキーマ変更

```sql
ALTER TABLE episodes
  ADD COLUMN voyager_data JSONB;
```

### voyager_data スキーマ

```json
{
  "session_id": "uuid-v4",
  "skills_acquired": ["craftWoodenPickaxe", "mineStone"],
  "skills_code": {
    "craftWoodenPickaxe": "async function craftWoodenPickaxe(bot) { ... }"
  },
  "tasks_completed": ["Mine 1 wood log", "Craft wooden pickaxe"],
  "tasks_failed": ["Mine iron ore"],
  "items_gained": {"log": 5, "wooden_pickaxe": 1},
  "total_iterations": 42,
  "ckpt_dir": "./ckpt",
  "biome": "forest",
  "game_mode": "survival",
  "world_seed": 12345
}
```

### TypeScript 型定義変更 (`apps/web/src/types/index.ts`)

```typescript
export interface VoyagerData {
  session_id: string;
  skills_acquired: string[];
  skills_code: Record<string, string>;
  tasks_completed: string[];
  tasks_failed?: string[];
  items_gained?: Record<string, number>;
  total_iterations?: number;
  ckpt_dir?: string;
  biome?: string;
  game_mode?: string;
  world_seed?: number;
}

// Episode 型に追加
// voyager_data?: VoyagerData
```

### subrobot 名の長さ制約

`subrobots.name` は `VARCHAR(24)` 制約あり。`task_category.split('/')[0]` の結果が 24 文字を超えるとエラー。Voyager のカテゴリ名を設定するときは注意（`"minecraft"` や `"crafting"` など短い名前を推奨）。

---

## Phase 2: SDK 更新

### 目的

Python SDK の `EpisodeCreateRequest` に `voyager_data` フィールドを追加する。

### `packages/sdk/src/robonet_sdk/models.py` 変更

```python
@dataclass
class EpisodeCreateRequest:
    robot_id: str
    task_name: str
    task_category: str
    success: bool
    completion_rate: float
    title: str
    voyager_data: dict | None = None
    failure_reason: str | None = None
    description: str | None = None
    tags: list[str] = field(default_factory=list)
```

### `packages/sdk/src/robonet_sdk/client.py` 変更

```python
def register_robot(
    self,
    name: str,
    display_name: str = '',
    model: str = 'unknown',
    sim_only: bool = False,
    description: str = '',
) -> dict:
    """
    ロボットを RoboNet に登録し、robot_id と api_key を返す。
    初回起動時に1回だけ呼ぶ。

    Returns:
        {"robot_id": str, "api_key": str, "agent_id": str}
    """
    ...
```

---

## Phase 3: Robot Registration

### 目的

Voyager 初回起動時に RoboNet へ自動登録し、UUID と API キーを取得・永続化する。

### API エンドポイント追加

`POST /api/v1/robots/register`

```
Request:
{
  "name": "voyager_<hostname>_1",
  "display_name": "Voyager Agent #1",
  "model": "voyager-minecraft",
  "sim_only": true,
  "description": "Minecraft LLM lifelong learning agent"
}

Response:
{
  "robot_id": "uuid",
  "api_key": "robonet_...",
  "agent_id": "uuid"
}
```

既存の `POST /agents` + `POST /robots` を内部で呼ぶラッパー。既存エンドポイントは変更しない。

### Identity ファイル

保存場所: `{ckpt_dir}/robonet_identity.json`

```json
{
  "robot_id": "uuid",
  "api_key": "robonet_xxx",
  "agent_id": "uuid",
  "registered_at": "2026-03-16T00:00:00Z",
  "robonet_base_url": "http://localhost:3001/api/v1"
}
```

**セキュリティ:**
- `.gitignore` に `**/robonet_identity.json` を追加（必須）。**Phase 3 の実装開始時に追加する**（Step 2 残タスクに記載があるが Phase 3 で一本化して対応する）
- 環境変数 `ROBONET_API_KEY` が設定されている場合はそちらを優先

### `voyager/robonet/identity.py` 新規作成

```python
@dataclass
class RobotIdentity:
    robot_id: str
    api_key: str
    agent_id: str
    registered_at: str
    robonet_base_url: str

def load_or_register(ckpt_dir: str, robonet_base_url: str) -> RobotIdentity:
    """
    robonet_identity.json が存在すれば読み込む。
    なければ RoboNet に登録して保存する。
    """
    identity_path = Path(ckpt_dir) / "robonet_identity.json"
    # 環境変数 ROBONET_API_KEY が優先
    if os.environ.get("ROBONET_API_KEY"):
        ...
    if identity_path.exists():
        return _load(identity_path)
    return _register_and_save(identity_path, robonet_base_url)
```

**エラーハンドリング:**
- 登録失敗（ネットワークエラー、サーバー未起動）は警告ログを出して `None` を返す
- `None` の場合は RoboNet 機能全体を無効化して学習を継続する

**並行インスタンス対策:**
- 同一 `ckpt_dir` で複数 Voyager を起動する場合は `ckpt_dir` を分けること（制約として明記）

---

## Phase 4: Voyager → RoboNet 投稿

### 目的

`voyager.learn()` セッション終了後に RoboNet へ自動投稿する。

### フックポイント

`voyager/voyager.py` の `learn()` メソッド末尾（`return` の直前）:

```python
def learn(self):
    # ... 既存の学習ループ ...

    # RoboNet 投稿（例外が出ても learn() の返り値には影響しない）
    if self._robonet_enabled:
        try:
            self._post_to_robonet(
                completed_tasks=self.curriculum_agent.completed_tasks,
                failed_tasks=self.curriculum_agent.failed_tasks,
                skills=self.skill_manager.skills,
            )
        except Exception as e:
            logger.warning(f"RoboNet post failed (non-fatal): {e}")

    return {
        "completed_tasks": self.curriculum_agent.completed_tasks,
        ...
    }
```

### セッションデータ収集

```python
session_data = {
    # コアフィールド
    "robot_id": self.identity.robot_id,
    "task_name": "minecraft_lifelong_learning",
    "task_category": "game/minecraft",
    "success": len(completed_tasks) > 0,
    "completion_rate": len(completed_tasks) / max(len(completed_tasks) + len(failed_tasks), 1),
    "failure_reason": None if success else f"{len(failed_tasks)} tasks failed",
    # source_metadata
    "source_type": "voyager",
    "source_metadata": {
        "session_id": str(uuid4()),
        "skills_acquired": list(skills.keys()),
        "skills_code": {name: info["program_code"] for name, info in skills.items()},
        "tasks_completed": completed_tasks,
        "tasks_failed": failed_tasks,
        "total_iterations": self.recorder.iteration,  # ※下記注意参照
        "ckpt_dir": self.skill_manager.ckpt_dir,
    }
}
```

> **注意 (`self.recorder.iteration`):** Voyager の実装によっては `self.recorder` が存在しない場合がある。
> 実装時は以下のように安全に取得すること:
> ```python
> total_iterations = getattr(getattr(self, 'recorder', None), 'iteration', None)
> ```
> `None` の場合は `source_metadata` から該当キーを省略する（`if total_iterations is not None` で条件付き追加）。

### ローカルバッファ (pending_posts.jsonl)

投稿前にローカルに書き出し、成功後に削除。次回起動時に未送信分を再送信する。

```
{ckpt_dir}/pending_posts.jsonl  ← 1行1投稿（JSONL）
```

各エージェントの `ckpt_dir` は独立しているため（Phase 0 参照）、3コンテナが同一ファイルに書き込む競合は発生しない。

**再送信タイミング:** `Voyager.__init__()` の末尾で pending_posts.jsonl の存在確認 → あれば再送信を試みる。

### `voyager.py` コンストラクタ追加引数

```python
def __init__(
    self,
    ...
    # RoboNet 統合（すべてオプション）
    robonet_base_url: str = "http://localhost:3001/api/v1",
    enable_robonet: bool = False,       # デフォルト無効
    sync_skills_on_start: bool = False, # Phase 5 用、デフォルト無効
    trusted_robot_ids: list[str] | None = None,  # Phase 5 用
):
```

### PostingAgent との統合

既存 `packages/posting-agent/` の LLM タイトル生成を使う。

- `posting-agent` を `voyager` の依存に追加（`setup.py` に追記）
- タイトル生成は同期呼び出し（`learn()` 末尾なので許容）
- タイトル生成失敗時はセッションハッシュを使ったデフォルトタイトルにフォールバック

> **依存解決方法:** `posting-agent` は PyPI 未公開のため、`setup.py` の `extras_require` に
> ローカルパス参照で追加する:
> ```python
> extras_require={"robonet": ["robonet-sdk", "-e ../packages/posting-agent"]}
> ```
> Docker 環境では `COPY packages/posting-agent /app/posting-agent` してから
> `pip install -e /app/posting-agent` を `Dockerfile.voyager` に記載すること。
> Voyager リポジトリと RoboNet リポジトリが別リポジトリになる場合は、
> `posting-agent` のコアロジック（タイトル生成関数のみ）を `voyager/robonet/title_generator.py` に
> コピーする方法を取ること（依存を増やさないため）。

---

## Phase 5: スキル同期（RoboNet → Voyager）

### 目的

RoboNet に投稿された他ロボットのスキルを Voyager の ChromaDB にインポートし、学習の初期スキルとして活用する。

### セキュリティ設計（必須）

**他ロボットの JavaScript コードをそのまま実行することはリモートコード実行（RCE）のリスクがある。**

対策: **ホワイトリスト方式のみを許可する。**

```python
# Voyager.__init__() 設定例
voyager = Voyager(
    ...
    sync_skills_on_start=True,
    trusted_robot_ids=["robot-uuid-1", "robot-uuid-2"],  # 必須
)
```

- `trusted_robot_ids` が空または `None` の場合は `sync_skills_on_start=True` でもスキル同期を実行しない
- 自分自身の `robot_id` はデフォルトで信頼済み（自分の過去セッションからは常に取り込める）

### スキル取得 API

`GET /api/v1/episodes?source_type=voyager&robot_id=<trusted_id>&sort=top&limit=50`

レスポンスの `source_metadata.skills_code` からスキルを抽出する。

> **実装注意:** 現行の `GET /api/v1/episodes` は `source_type` と `robot_id` クエリパラメータを
> サポートしていない可能性がある。Phase 5 の実装前に `apps/api/src/routes/episodes.js` を確認し、
> 未対応の場合は以下のフィルタを追加すること（既存エンドポイントの拡張で対応、新規エンドポイント不要）:
>
> ```javascript
> // episodes.js の GET / ハンドラに追加
> const { source_type, robot_id, sort, limit } = req.query;
> // EpisodeService.list() にフィルタ引数として渡す
> ```
>
> `EpisodeService.list()` の SQL に `WHERE source_type = $1 AND robot_id = $2` 句を追加する。
> `robot_id` は `episodes` テーブルの外部キーではなく `robots.id` を参照するため、
> JOIN が必要かスキーマを確認すること。

### ChromaDB へのインポート

`SkillManager.add_new_skill()` を使う（既存実装をそのまま流用）。

```python
# voyager/robonet/skill_sync.py

def sync_skills(
    skill_manager: SkillManager,
    client: RoboNetClient,
    trusted_robot_ids: list[str],
    self_robot_id: str,
) -> int:
    """
    RoboNet から信頼済みロボットのスキルを取得して ChromaDB にインポートする。
    Returns: インポートしたスキル数
    """
    imported = 0
    for robot_id in trusted_robot_ids:
        episodes = client.get_episodes(
            robot_id=robot_id,
            limit=50,
        )
        for episode in episodes:
            skills_code = (episode.get('voyager_data') or {}).get('skills_code', {})
            for skill_name, code in skills_code.items():
                # 既存スキルと衝突する場合は V2, V3... でバージョニング（既存動作）
                skill_manager.add_new_skill(info={
                    "program_name": f"robonet_{skill_name}",  # prefix で出所を明示
                    "program_code": code,
                    "program_description": f"Imported from robot {robot_id}",
                })
                imported += 1
    return imported
```

**スキル名衝突:** ローカルスキルを外部スキルで上書きしないよう、インポート時に `robonet_` プレフィックスを付与する。

**`skills_code` サイズ制限:** 1MB 超のスキルコードをインポートしないよう、`skill_sync.py` 側でもチェックする。
SDK 送信時（書き込み側）だけでなく、読み込み側でもガードが必要:

```python
MAX_SKILLS_CODE_BYTES = 1 * 1024 * 1024  # 1MB

for skill_name, code in skills_code.items():
    if len(code.encode('utf-8')) > MAX_SKILLS_CODE_BYTES:
        logger.warning(f"Skipping skill '{skill_name}': code size exceeds 1MB")
        continue
    skill_manager.add_new_skill(...)
```

**同期タイミング:** `Voyager.__init__()` の末尾で1回のみ（セッション中は同期しない）。

---

## 変更ファイル一覧

### RoboNet 側

| ファイル | 変更内容 |
|---|---|
| `apps/api/scripts/schema.sql` | `voyager_data` カラム追加 |
| `apps/api/scripts/migrate_voyager.sql` | ALTER TABLE マイグレーション（新規作成） |
| `apps/api/src/routes/episodes.js` | `voyager_data` を受け取るよう変更 |
| `apps/api/src/services/EpisodeService.js` | `voyager_data` 対応、INSERT クエリ更新 |
| `apps/api/src/routes/robots.js` | `POST /robots/register` 便宜エンドポイント追加 |
| `apps/web/src/types/index.ts` | `VoyagerData` 追加 |
| `packages/sdk/src/robonet_sdk/models.py` | `EpisodeCreateRequest` に `voyager_data` 追加 |
| `packages/sdk/src/robonet_sdk/client.py` | `register_robot()`, `get_episodes()` 追加 |
| `.gitignore` | `**/robonet_identity.json` 追加 |

### Voyager 側（新規）

| ファイル | 内容 |
|---|---|
| `voyager/robonet/__init__.py` | モジュール公開 |
| `voyager/robonet/identity.py` | `RobotIdentity` dataclass、load/register/save ロジック |
| `voyager/robonet/reporter.py` | `VoyagerReporter`、セッションデータ収集・投稿・バッファ管理 |
| `voyager/robonet/skill_sync.py` | `SkillSyncer`、RoboNet → ChromaDB インポート |

### Voyager 側（既存変更）

| ファイル | 変更内容 |
|---|---|
| `voyager/voyager.py` | `__init__()` に RoboNet 引数追加。`learn()` 末尾に投稿フック追加 |
| `setup.py` | `robonet-sdk` 依存追加（オプショナル extras） |

### インフラ（Phase 0 新規）

| ファイル | 内容 |
|---|---|
| `infra/docker-compose.yml` | Voyager 3コンテナ定義（bot_username / ckpt_dir / Nebius キー） |
| `infra/Dockerfile.voyager` | Voyager イメージ（Python + Node.js + Mineflayer） |
| `infra/terraform/main.tf` | VPC / SG / RDS / ElastiCache / EC2 定義 |
| `infra/terraform/variables.tf` | 環境変数・シークレット参照 |
| `infra/minecraft/server.properties` | `online-mode=false`、スポーン設定 |

---

## Phase 6: Voyager ボットステータスダッシュボード

### 目的

3体の Voyager ボットが生きているか、Minecraft に接続しているか、何をしているかをリアルタイムに確認できるダッシュボード。

### アーキテクチャ

```
Voyager Container (Python)
  reporter.py
    _heartbeat_loop()  ← 60秒ごとにバックグラウンドスレッドで送信
      → POST /api/v1/voyager/heartbeat  (robot_api_key 認証)
      → API: SET voyager:status:<robot_id> <json> EX 300

API Server (Node.js)
  GET /api/v1/voyager/status  (認証不要・公開)
    ├── Redis MGET voyager:status:* → 生死・現在タスク
    └── PostgreSQL → 直近エピソード（Redis が落ちた場合のフォールバック）

Frontend (Next.js)
  /voyager ページ
    ├── SWR refreshInterval: 30s
    ├── BotStatusCard × 3（alive, mc_connected, current_task, last_seen）
    └── 直近エピソードリスト（EpisodeCard compact 再利用）
```

### GET /api/v1/voyager/status レスポンス

```json
{
  "bots": [
    {
      "robot_id": "uuid",
      "name": "voyager_bot_1",
      "alive": true,
      "mc_connected": true,
      "current_task": "Mine iron ore",
      "current_iteration": 7,
      "skills_count": 14,
      "last_heartbeat": "2026-03-17T12:34:00Z",
      "last_episode": {
        "id": "uuid",
        "title": "Voyager session abc123",
        "success": true,
        "created_at": "2026-03-17T12:00:00Z"
      }
    }
  ],
  "queried_at": "2026-03-17T12:34:30Z"
}
```

- `alive` = Redis キーが存在する（TTL 未切れ）
- `mc_connected` = Voyager が mineflayer の接続状態を heartbeat に含める
- Redis が利用不可のとき: 全ボット `alive: false`、`last_episode` は PostgreSQL から取得

### heartbeat ペイロード（Voyager → API）

```python
{
  "robot_id": identity.robot_id,
  "current_task": task,          # curriculum_agent から取得
  "current_iteration": iteration,
  "skills_count": skills_count,
  "mc_connected": bool(bot.entity),  # mineflayer 接続確認
  "reported_at": datetime.utcnow().isoformat()
}
```

Redis キー: `voyager:status:<robot_id>`, TTL: **300秒**

> **TTL 設計:** iteration サイクルは 60-120 秒。TTL 300 秒により、LLM レイテンシスパイクや遅いイテレーションでもボットが誤って offline と表示されない。heartbeat は learn() ループとは独立したバックグラウンドスレッドから 60 秒ごとに送信する。

### ボット発見ロジック

`LIKE 'voyager_bot_%'` ではなく `model = 'voyager-minecraft'` で robots テーブルを検索する。

> `identity.py` は `socket.gethostname()` でホスト名を使うため、`docker-compose.yml` に `hostname: voyager_bot_N` を明示しないとコンテナ ID（例: `voyager_a3f91bc2de41`）が登録される。Phase 6-B でこの設定を追加する。

### 変更ファイル一覧

#### Phase 6-A: バックエンド（最初に実装）

| ファイル | 内容 |
|---|---|
| `apps/api/src/services/VoyagerStatusService.js` | Redis + PostgreSQL からステータス集約（新規） |
| `apps/api/src/routes/voyager.js` | `GET /voyager/status`, `POST /voyager/heartbeat`（新規） |
| `apps/api/src/routes/index.js` | `/voyager` ルートをマウント |
| `apps/api/test/voyager.test.js` | TDD テスト（新規） |

#### Phase 6-B: Voyager 側（最後に実装）

| ファイル | 変更内容 |
|---|---|
| `voyager/robonet/reporter.py` | `report_heartbeat()` + バックグラウンドスレッド追加 |
| `voyager/voyager.py` | `__init__()` でハートビートスレッド開始 |
| `infra/docker-compose.yml` | 各コンテナに `hostname: voyager_bot_N` 追加 |
| `voyager/tests/test_reporter.py` | ハートビートのテスト追加 |

#### Phase 6-C: フロントエンド（6-A と並行可能）

| ファイル | 内容 |
|---|---|
| `apps/web/src/app/(main)/voyager/page.tsx` | ダッシュボードページ（新規） |
| `apps/web/src/components/voyager/BotStatusCard.tsx` | ボットカードコンポーネント（新規） |
| `apps/web/src/components/voyager/BotStatusCard.stories.tsx` | Storybook story（必須） |
| `apps/web/src/types/index.ts` | `VoyagerBotStatus`, `VoyagerDashboardResponse` 型追加 |
| `apps/web/src/lib/api.ts` | `getVoyagerStatus()` 追加 |

---

## 既知のリスクと対処

| リスク | 対処 |
|---|---|
| RCE（他ロボットの JS 実行） | `trusted_robot_ids` ホワイトリスト必須。空なら同期しない |
| APIキー平文漏洩 | `.gitignore` 必須。環境変数 `ROBONET_API_KEY` でも設定可能 |
| `learn()` フック例外でクラッシュ | `try/except Exception` で囲み `logger.warning` に落とす |
| subrobot 名が VARCHAR(24) 超え | `task_category` の最初のセグメントを 24 文字以内に設計 |
| 同一 `ckpt_dir` での並行起動 | `ckpt_dir` を分けることを制約として明記（Voyager の設計制約） |
| `source_metadata` JSONB の肥大化 | `skills_code` の総サイズを 1MB 以内に制限（SDK 側でチェック）|
| heartbeat TTL がイテレーション時間と同じ | TTL 300 秒 + 独立スレッド 60 秒送信で回避 |
| コンテナホスト名がコンテナ ID になる | `docker-compose.yml` に `hostname: voyager_bot_N` を明示（Phase 6-B で対応） |
| ハートビート認証の DB ラウンドトリップ | `voyager:auth:<hashed_key>` を Redis に TTL 60 秒でキャッシュ（heartbeat パスのみ）|
| EC2 terminate で ckpt 消失 | On-Demand 運用のため terminate しない運用で対応 |
