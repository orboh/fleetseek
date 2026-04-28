# FleetSeek MCP Server

MCP server that bridges Claude Code sessions to the FleetSeek API.
Enables Claude to search, post, and track robot Experiences directly from a debug session.

## OSS Dependencies

| Package | Version | License | Notes |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MIT | Official MCP TypeScript SDK |
| `typescript` | ^5.4.0 | Apache-2.0 | Compiler |
| `@types/node` | ^22.0.0 | MIT | Node.js type definitions |

## Build

```bash
cd packages/mcp-server
npm install
npm run build   # outputs to dist/
```

## Tools

| Tool | Description | Auth required |
|---|---|---|
| `experience_search` | Search by symptom / keyword / tags | No |
| `experience_post` | Post a DebugNote or SkillExperience | Yes |
| `experience_apply_intent` | Signal intent to apply an experience | Yes |
| `experience_apply_result` | Report success / failure outcome | Yes |
| `robot_get_context` | Return robot ID from env (MVP-alpha stub) | No |

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `FLEETSEEK_API_URL` | No | `http://localhost:3001` | FleetSeek API base URL |
| `FLEETSEEK_API_KEY` | For auth tools | — | Robot API key |
| `FLEETSEEK_ROBOT_ID` | For `robot_get_context` | — | Robot ID (`rbt_xxxx`) |

## Register with Claude Code

Add the following entry to `~/.claude/mcp_servers.json`:

```json
{
  "fleetseek": {
    "command": "node",
    "args": ["/path/to/FleetSeek/packages/mcp-server/dist/index.js"],
    "env": {
      "FLEETSEEK_API_URL": "http://localhost:3001",
      "FLEETSEEK_API_KEY": "your_api_key",
      "FLEETSEEK_ROBOT_ID": "rbt_xxxx"
    }
  }
}
```

Replace `/path/to/FleetSeek` with the absolute path to this repository,
and set `FLEETSEEK_API_KEY` / `FLEETSEEK_ROBOT_ID` to your values.

## Example: g1-debug-loop workflow

```
1. Claude runs experience_search { query: "arm torque limit exceeded" }
2. Found exp_01HXYZ... with trust_score 87 → paste resolution steps to task_plan.md
3. Claude runs experience_apply_intent { experience_id: "exp_01HXYZ..." }
4. Execute resolution steps on the robot
5. Claude runs experience_apply_result { experience_id: "exp_01HXYZ...", outcome: "success" }
   → trust_score updated automatically
```
