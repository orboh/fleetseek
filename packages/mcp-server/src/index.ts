#!/usr/bin/env node
/**
 * FleetSeek MCP Server
 *
 * Bridges Claude Code sessions to the FleetSeek API (port 3001).
 * Provides tools for searching, posting, and tracking robot Experiences.
 *
 * Environment variables:
 *   FLEETSEEK_API_URL   - Base URL (default: http://localhost:3001)
 *   FLEETSEEK_API_KEY   - API key for authenticated endpoints
 *   FLEETSEEK_ROBOT_ID  - Robot ID (rbt_xxxx) for context tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = (process.env.FLEETSEEK_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_KEY = process.env.FLEETSEEK_API_KEY ?? "";
const ROBOT_ID = process.env.FLEETSEEK_ROBOT_ID ?? "";

const API_BASE = `${API_URL}/api/v1`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Headers for unauthenticated requests */
function baseHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

/** Headers for authenticated requests */
function authHeaders(): Record<string, string> {
  if (!API_KEY) {
    throw new Error(
      "FLEETSEEK_API_KEY is not set. " +
        "Add it to the MCP server env config in ~/.claude/mcp_servers.json."
    );
  }
  return { ...baseHeaders(), Authorization: `Bearer ${API_KEY}` };
}

/**
 * Perform a JSON fetch and return the parsed response body.
 * Throws a descriptive error on non-2xx status.
 */
async function apiFetch(
  url: string,
  options: RequestInit
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw new Error(
      `Network error reaching FleetSeek API at ${url}: ${String(err)}`
    );
  }

  let body: unknown;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const msg =
      typeof body === "object" && body !== null && "message" in body
        ? (body as { message: string }).message
        : text;
    throw new Error(`FleetSeek API error ${response.status}: ${msg}`);
  }

  return body;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "fleetseek",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: experience_search
// ---------------------------------------------------------------------------

server.tool(
  "experience_search",
  "Search FleetSeek Experiences (SkillExperience and DebugExperience) by symptoms, " +
    "task keywords, tags, or type. Results are sorted by trust_score descending.",
  {
    query: z.string().describe("Keyword or symptom text to search for"),
    type: z
      .enum(["skill", "debug_note"])
      .optional()
      .describe('Filter by type: "skill" (successful motions) or "debug_note" (failure recoveries)'),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by one or more tags (OR match)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of results to return (default: 10)"),
  },
  async ({ query, type, tags, limit }) => {
    try {
      const body = await apiFetch(`${API_BASE}/experiences/search`, {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ query, type, tags, limit: limit ?? 10 }),
      });

      const data = body as {
        experiences?: unknown[];
        count?: number;
      };
      const experiences = data?.experiences ?? [];
      const count = data?.count ?? (experiences as unknown[]).length;

      // Return a concise summary of each experience
      const summaries = (experiences as Array<Record<string, unknown>>).map(
        (exp) => ({
          id: exp.id,
          type: exp.type,
          title: exp.title,
          status: exp.status,
          trust_score: exp.trust_score,
          tags: exp.tags,
          data_summary:
            exp.data !== null && typeof exp.data === "object"
              ? Object.keys(exp.data as object).join(", ")
              : null,
        })
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count, experiences: summaries }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `experience_search failed: ${String(err)}`,
          },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: experience_post
// ---------------------------------------------------------------------------

server.tool(
  "experience_post",
  "Post a new DebugNote or SkillExperience to FleetSeek. " +
    "Requires FLEETSEEK_API_KEY to be set.",
  {
    type: z
      .enum(["skill", "debug_note"])
      .describe(
        '"skill" for successful motions / task completions, "debug_note" for failure recoveries'
      ),
    title: z.string().describe("Short, descriptive title for the experience"),
    description: z
      .string()
      .optional()
      .describe("Longer free-text description"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Searchable tags (e.g. ['g1', 'arm', 'grasping'])"),
    data: z
      .record(z.unknown())
      .describe(
        "Type-specific payload. For debug_note: { symptoms, root_cause, resolution, failed_attempts }. " +
          "For skill: { task, steps, success_condition }"
      ),
    visibility: z
      .enum(["public", "private", "team"])
      .optional()
      .describe('Visibility scope (default: "public")'),
  },
  async ({ type, title, description, tags, data, visibility }) => {
    try {
      const body = await apiFetch(`${API_BASE}/experiences`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ type, title, description, tags, data, visibility }),
      });

      const resp = body as { experience?: { id?: string; status?: string } };
      const experience = resp?.experience ?? {};

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: (experience as Record<string, unknown>).id,
                status: (experience as Record<string, unknown>).status,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `experience_post failed: ${String(err)}`,
          },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: experience_apply_intent
// ---------------------------------------------------------------------------

server.tool(
  "experience_apply_intent",
  "Signal intent to apply an Experience before actually executing it. " +
    "Call this before running the resolution steps so FleetSeek can track the attempt. " +
    "Requires FLEETSEEK_API_KEY.",
  {
    experience_id: z
      .string()
      .describe("The Experience ID to apply (e.g. exp_01HXYZ...)"),
  },
  async ({ experience_id }) => {
    try {
      const body = await apiFetch(
        `${API_BASE}/experiences/${encodeURIComponent(experience_id)}/intent_to_apply`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
        }
      );

      const resp = body as { application?: { id?: string } };
      const applicationId = resp?.application?.id ?? null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ application_id: applicationId }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `experience_apply_intent failed: ${String(err)}`,
          },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: experience_apply_result
// ---------------------------------------------------------------------------

server.tool(
  "experience_apply_result",
  "Report the outcome of applying an Experience. " +
    "The result is factored into the Experience's trust_score. " +
    "Requires FLEETSEEK_API_KEY.",
  {
    experience_id: z
      .string()
      .describe("The Experience ID that was applied"),
    outcome: z
      .enum(["success", "failure", "partial", "skipped"])
      .describe(
        '"success": resolved the problem, "failure": did not work, ' +
          '"partial": partially resolved, "skipped": decided not to apply'
      ),
    outcome_notes: z
      .string()
      .optional()
      .describe("Free-text notes explaining the outcome"),
    session_id: z
      .string()
      .optional()
      .describe("Optional debug session ID for correlation"),
  },
  async ({ experience_id, outcome, outcome_notes, session_id }) => {
    try {
      const body = await apiFetch(
        `${API_BASE}/experiences/${encodeURIComponent(experience_id)}/applications`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ outcome, outcome_notes, session_id }),
        }
      );

      const resp = body as {
        application?: { experience_id?: string };
      };
      const application = resp?.application ?? {};

      // Fetch updated trust_score
      let trust_score: unknown = null;
      try {
        const expBody = await apiFetch(
          `${API_BASE}/experiences/${encodeURIComponent(experience_id)}`,
          { method: "GET", headers: baseHeaders() }
        );
        const expResp = expBody as {
          experience?: { trust_score?: number };
        };
        trust_score = expResp?.experience?.trust_score ?? null;
      } catch {
        // Non-fatal: trust_score refresh is best-effort
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                outcome,
                experience_id: (application as Record<string, unknown>).experience_id ?? experience_id,
                updated_trust_score: trust_score,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `experience_apply_result failed: ${String(err)}`,
          },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: robot_get_context
// ---------------------------------------------------------------------------

server.tool(
  "robot_get_context",
  "Return the current robot's applicability context from environment variables. " +
    "MVP-alpha stub: reads FLEETSEEK_ROBOT_ID; config_snapshot not yet implemented.",
  {},
  async () => {
    try {
      if (!ROBOT_ID) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                "FLEETSEEK_ROBOT_ID is not set. " +
                "Add it to the MCP server env config in ~/.claude/mcp_servers.json.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                robot_id: ROBOT_ID,
                note: "config_snapshot not yet implemented",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `robot_get_context failed: ${String(err)}`,
          },
        ],
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio; do not write to stdout
  process.stderr.write("FleetSeek MCP Server started (stdio transport)\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
