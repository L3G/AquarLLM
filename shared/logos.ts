/**
 * Logos — the canonical event vocabulary for AquarLLM.
 *
 * This is the single source of truth shared by Hermes (server), Agora (client),
 * and Eidolon (simulator). Adapters (e.g. Iris for Claude Code) produce either a
 * raw provider payload that Hermes normalizes, or a canonical `AgentEvent` posted
 * straight to `/ingest`.
 */

/** What kind of agent an avatar represents (drives sprite/palette). */
export type AgentKind = "claude" | "codex" | "grok" | "custom";

/** The normalized thing an agent is doing right now. */
export type Activity =
  | "joined" // session started — character walks in
  | "left" // session ended — character walks out
  | "thinking" // new prompt / planning
  | "reading" // browsing code (Read/Glob/Grep)
  | "editing" // writing code (Edit/Write)
  | "running" // shell commands (Bash) or MCP tools
  | "searching" // web fetch / search
  | "waiting" // blocked on the user (AskUserQuestion / Notification)
  | "spawning" // launching a subagent
  | "error" // a tool failed
  | "idle"; // turn finished, resting

/** A district is a region of the tile grid an avatar navigates to. */
export type District =
  | "gate" // spawn / exit point
  | "forum" // center — thinking / prompts
  | "library" // reading
  | "workshop" // editing
  | "terminal" // running commands
  | "gateway" // web search
  | "helpdesk" // waiting on the user
  | "stoa" // idle / lounge
  | "repair"; // error

export const DISTRICTS: District[] = [
  "gate",
  "forum",
  "library",
  "workshop",
  "terminal",
  "gateway",
  "helpdesk",
  "stoa",
  "repair",
];

/** Where each activity sends an avatar. */
export const ACTIVITY_TO_DISTRICT: Record<Activity, District> = {
  joined: "gate",
  left: "gate",
  thinking: "forum",
  reading: "library",
  editing: "workshop",
  running: "terminal",
  searching: "gateway",
  waiting: "helpdesk",
  spawning: "forum",
  error: "repair",
  idle: "stoa",
};

/**
 * Map a Claude Code tool name to an Activity. Used by Hermes' normalizer and by
 * any adapter that wants to classify tool use the same way.
 */
export function toolToActivity(tool: string): Activity {
  switch (tool) {
    case "Read":
    case "Glob":
    case "Grep":
    case "NotebookRead":
    case "LS":
      return "reading";
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return "editing";
    case "Bash":
    case "BashOutput":
    case "KillShell":
      return "running";
    case "WebFetch":
    case "WebSearch":
      return "searching";
    case "Agent":
    case "Task":
      return "spawning";
    case "AskUserQuestion":
    case "ExitPlanMode":
      return "waiting";
    default:
      // MCP tools (mcp__server__tool) are treated as "running" work.
      if (tool.startsWith("mcp__")) return "running";
      return "thinking";
  }
}

/**
 * The canonical event every producer emits. Hermes folds these into world state.
 */
export interface AgentEvent {
  agentKind: AgentKind;
  /** Stable per agent/session. For Claude this is the hook `session_id`. */
  agentId: string;
  displayName?: string;
  activity: Activity;
  /** Human-readable specifics for the speech bubble, e.g. "auth.ts", "npm test". */
  detail?: string;
  /** Project context, typically basename(cwd). */
  project?: string;
  /** Full working directory — Clio resolves this to a repo (village) id. Local-only. */
  cwd?: string;
  /** Repo (village) id this agent belongs to. Set by Hermes via Clio, or by a producer. */
  repo?: string;
  /** For subagents: the parent agentId (rendered as a tethered companion). */
  parentId?: string;
  /** Epoch ms. Producers stamp this; Hermes fills it if missing. */
  ts: number;
}

/** The server-side state Hermes keeps per live agent. */
export interface AgentState {
  agentId: string;
  agentKind: AgentKind;
  displayName: string;
  activity: Activity;
  district: District;
  detail?: string;
  project?: string;
  /** Full working directory (local-only; used to resolve the village). */
  cwd?: string;
  /** Repo (village) id — folders sharing a repo cluster into one village. */
  repo?: string;
  parentId?: string;
  /** Epoch ms of the last event applied. */
  lastUpdate: number;
}

/** Full world state pushed to clients on every change. */
export interface WorldSnapshot {
  type: "snapshot";
  agents: AgentState[];
}

/**
 * A repo (village) Clio has inspected. Drives the village's scale/tier (history + size)
 * and seeds the Ploutos economy. `real:false` means the stats were synthesized (no git).
 */
export interface RepoInfo {
  /** Stable village id — the git toplevel path (or the project name when no git). */
  id: string;
  /** Display name — the repo's folder basename. */
  name: string;
  /** Absolute git toplevel (real repos only). */
  root?: string;
  /** Commit count on HEAD. */
  commits: number;
  /** Days since the first commit. */
  ageDays: number;
  /** Distinct commit authors. */
  contributors: number;
  /** Tracked file count (a cheap size proxy). */
  files: number;
  /** Top-level directories of the repo (each becomes a labelled house in the village). */
  dirs?: string[];
  /** True when measured from a real git repo, false when synthesized. */
  real: boolean;
}

/** Repo (village) metadata — sent on connect and whenever Clio learns/refreshes a repo. */
export interface RepoMessage {
  type: "repos";
  repos: RepoInfo[];
}

/** One line in the activity feed — a discrete thing an agent did. */
export interface LogEntry {
  ts: number;
  agentId: string;
  agentKind: AgentKind;
  project?: string;
  displayName: string;
  activity: Activity;
  detail?: string;
}

/** A batch of activity-feed lines (history on connect, or a single live event). */
export interface LogMessage {
  type: "log";
  entries: LogEntry[];
}

/** Atlas measures the machine running Hermes (not just this app or its agents). */
export interface SystemResourcesMessage {
  type: "resources";
  /** Epoch ms of the latest CPU/memory sample. Disk has its own slower clock. */
  sampledAt: number;
  hostname: string;
  cpu: {
    /** Busy time across all logical cores. Null during warm-up or when unavailable. */
    usagePercent: number | null;
    cores: number;
  };
  /** Total minus free physical memory; includes OS caches, not memory pressure. */
  memory: { usedBytes: number; totalBytes: number; usagePercent: number } | null;
  disk: {
    usedBytes: number;
    totalBytes: number;
    /** Space available to an ordinary user, excluding reserved free blocks. */
    availableBytes: number;
    usagePercent: number;
    /** A path on the measured filesystem: the server user's home directory. */
    volume: string;
    sampledAt: number;
  } | null;
}

/** Discriminated union of everything Hermes sends over the WebSocket. */
export type ServerMessage = WorldSnapshot | LogMessage | RepoMessage | SystemResourcesMessage;

/** Build a friendly default display name from kind + id. */
export function defaultDisplayName(kind: AgentKind, agentId: string): string {
  const short = agentId.slice(0, 6);
  return `${kind}-${short}`;
}
