/**
 * Normalize a Grok CLI hook payload into a canonical Logos AgentEvent.
 * Grok's global hooks (~/.grok/hooks/*.json) POST this envelope to /ingest/grok-hook:
 *   { hookEventName, sessionId, cwd, workspaceRoot, toolName, toolInput, timestamp }
 * (snake_case `hook_event_name`/`tool_name` are tolerated too.) Grok's own tool names
 * differ from Claude's, so it has its own activity mapping.
 */
import type { Activity, AgentEvent } from "@aquarllm/shared";

interface GrokHook {
  hookEventName?: string;
  hook_event_name?: string;
  sessionId?: string;
  session_id?: string;
  cwd?: string;
  workspaceRoot?: string;
  toolName?: string;
  tool_name?: string;
  toolInput?: Record<string, unknown>;
  tool_input?: Record<string, unknown>;
  prompt?: string;
  message?: string;
}

function basename(p?: string): string | undefined {
  if (!p) return undefined;
  const parts = p.replace(/\/+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || undefined;
}

function snippet(s: unknown, n = 60): string | undefined {
  if (typeof s !== "string") return undefined;
  const one = s.replace(/\s+/g, " ").trim();
  if (!one) return undefined;
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

/** Grok tool name → activity (run_terminal_command, read_file, search_replace, …). */
function grokToolActivity(tool: string | undefined): Activity {
  const t = (tool || "").toLowerCase();
  if (/terminal|command|bash|shell|exec|^run/.test(t)) return "running";
  if (/search_replace|str_replace|write|edit|create|apply_patch|patch|format/.test(t)) return "editing";
  if (/read|grep|list_dir|glob|cat|view|inspect/.test(t)) return "reading";
  if (/web_search|web_fetch|fetch|browse|http/.test(t)) return "searching";
  if (/subagent|spawn|task|delegate/.test(t)) return "spawning";
  if (t.startsWith("mcp")) return "running";
  return "thinking";
}

function detailFromGrokTool(input: Record<string, unknown> = {}): string | undefined {
  if (typeof input.command === "string") return snippet(input.command, 40);
  const f = (input.file_path ?? input.path ?? input.target_file ?? input.filepath) as string | undefined;
  if (f) return basename(f);
  if (input.query) return snippet(input.query, 30);
  if (input.pattern) return `/${snippet(input.pattern, 24)}/`;
  if (input.url) return basename(input.url as string) ?? snippet(input.url, 30);
  return undefined;
}

export function normalizeGrokHook(raw: GrokHook): AgentEvent | null {
  const evRaw = raw.hookEventName ?? raw.hook_event_name;
  const sessionId = raw.sessionId ?? raw.session_id;
  if (!evRaw || !sessionId) return null;

  const ev = String(evRaw).toLowerCase().replace(/[_\-\s]/g, "");
  const tool = raw.toolName ?? raw.tool_name;
  const input = (raw.toolInput ?? raw.tool_input ?? {}) as Record<string, unknown>;
  const project = basename(raw.workspaceRoot ?? raw.cwd);
  const base = { agentKind: "grok" as const, agentId: sessionId, project, ts: Date.now() };

  switch (ev) {
    case "sessionstart":
      return { ...base, activity: "joined", detail: project };
    case "sessionend":
      return { ...base, activity: "left" };
    case "userpromptsubmit":
      return { ...base, activity: "thinking", detail: snippet(raw.prompt) };
    case "stop":
      return { ...base, activity: "idle" };
    case "notification":
      return { ...base, activity: "waiting", detail: snippet(raw.message, 40) };
    case "subagentstart":
      return { ...base, activity: "spawning" };
    case "subagentstop":
      return { ...base, activity: "idle" };
    case "pretooluse":
    case "posttooluse":
      return { ...base, activity: grokToolActivity(tool), detail: detailFromGrokTool(input) };
    case "posttoolusefailure":
      return { ...base, activity: "error", detail: detailFromGrokTool(input) };
    default:
      return null;
  }
}
