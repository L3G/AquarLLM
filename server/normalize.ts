/**
 * Normalize a raw Claude Code hook payload into a canonical Logos AgentEvent.
 * Keeping this server-side means the Iris adapter can be a dumb curl that forwards
 * the hook JSON untouched.
 */
import { type AgentEvent, toolToActivity } from "@aquarllm/shared";

/** Subset of fields Claude Code delivers to a hook (see adapters/claude-code). */
interface ClaudeHook {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  prompt?: string;
  message?: string;
  agent_id?: string;
  agent_type?: string;
}

function basename(p?: string): string | undefined {
  if (!p) return undefined;
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || undefined;
}

function snippet(s: unknown, n = 60): string | undefined {
  if (typeof s !== "string") return undefined;
  const one = s.replace(/\s+/g, " ").trim();
  if (!one) return undefined;
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

function detailFromTool(tool?: string, input: Record<string, unknown> = {}): string | undefined {
  if (!tool) return undefined;
  switch (tool) {
    case "Read":
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
    case "NotebookRead":
      return basename((input.file_path ?? input.notebook_path) as string);
    case "Bash":
      return snippet(input.command, 40);
    case "Grep":
      return input.pattern ? `/${snippet(input.pattern, 24)}/` : undefined;
    case "Glob":
      return snippet(input.pattern, 30);
    case "WebFetch":
      return basename(input.url as string) ?? snippet(input.url, 30);
    case "WebSearch":
      return snippet(input.query, 30);
    case "Agent":
    case "Task":
      return snippet(input.description ?? input.subagent_type, 30);
    default:
      if (tool.startsWith("mcp__")) return tool.replace(/^mcp__/, "").replace(/__/g, ":");
      return undefined;
  }
}

export function normalizeClaudeHook(raw: ClaudeHook): AgentEvent | null {
  const ev = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (!ev || !sessionId) return null;

  // If agent_id is present the event fired inside a subagent — that subagent acts,
  // tethered to its parent session.
  const isSub = !!raw.agent_id;
  const agentId = raw.agent_id ?? sessionId;
  const parentId = isSub ? sessionId : undefined;
  const project = basename(raw.cwd);
  const ts = Date.now();
  // Label main agents by their working folder; subagents keep their type name.
  const displayName = isSub ? undefined : project;
  const base = { agentKind: "claude" as const, agentId, parentId, project, displayName, ts };

  switch (ev) {
    case "SessionStart":
      return { ...base, activity: "joined", detail: project };
    case "SessionEnd":
      return { ...base, activity: "left" };
    case "SubagentStart":
      return {
        ...base,
        agentId: raw.agent_id ?? agentId,
        parentId: sessionId,
        displayName: raw.agent_type,
        activity: "spawning",
      };
    case "SubagentStop":
      return { ...base, agentId: raw.agent_id ?? agentId, parentId: sessionId, activity: "left" };
    case "UserPromptSubmit":
      return { ...base, activity: "thinking", detail: snippet(raw.prompt) };
    case "Stop":
      return { ...base, activity: "idle" };
    case "Notification":
      return { ...base, activity: "waiting", detail: snippet(raw.message, 40) };
    case "PreToolUse":
    case "PostToolUse":
      return {
        ...base,
        activity: toolToActivity(raw.tool_name ?? ""),
        detail: detailFromTool(raw.tool_name, raw.tool_input),
      };
    case "PostToolUseFailure":
      return { ...base, activity: "error", detail: detailFromTool(raw.tool_name, raw.tool_input) };
    default:
      return null;
  }
}
