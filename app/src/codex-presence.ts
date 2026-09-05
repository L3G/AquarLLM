/**
 * Read-only Codex presence for macOS and Linux. A session is present only while
 * a real Codex process has its rollout open; saved history is never enumerated.
 * Rollout records are a best-effort compatibility source, not a public protocol.
 * Only session metadata and activity labels leave this module.
 */
import { execFile } from "node:child_process";
import { open, readdir, readlink } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { Activity, AgentEvent } from "@aquarllm/shared";

const pexec = promisify(execFile);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SESSION_ID = new RegExp(`^${UUID}$`, "i");
const ROLLOUT = new RegExp(`/sessions/\\d{4}/\\d{2}/\\d{2}/rollout-[^/]+-(${UUID})\\.jsonl$`, "i");
const HEADER_BYTES = 256 * 1024;
const TAIL_BYTES = 128 * 1024;

export interface CodexSessionMetadata {
  id: string;
  cwd: string;
  parentId?: string;
  displayName?: string;
}

export interface CodexScanResult { sessions: AgentEvent[]; complete: boolean; }
export type CodexScan = () => Promise<CodexScanResult>;
interface OpenRollouts { files: string[]; complete: boolean; }

/** ps comm is the whole remainder: executable paths can contain spaces. */
export function parseCodexProcesses(stdout: string): string[] {
  const pids = new Set<string>();
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (match && basename(match[2]!) === "codex") pids.add(match[1]!);
  }
  return [...pids];
}

/** lsof field output is parsed only within one of the selected processes. */
export function parseCodexOpenFiles(stdout: string, pids: string[]): string[] {
  const selected = new Set(pids);
  const files = new Set<string>();
  let active = false;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) active = selected.has(line.slice(1));
    else if (active && line.startsWith("n/") && ROLLOUT.test(line.slice(1))) files.add(line.slice(1));
  }
  return [...files];
}

const validId = (value: unknown): value is string => typeof value === "string" && SESSION_ID.test(value);
const object = (value: unknown): Record<string, any> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;

/** A complete first record is required; partial/invalid metadata is not guessed. */
export function parseCodexSessionHeader(header: string, path: string): CodexSessionMetadata | null {
  const filenameId = ROLLOUT.exec(path)?.[1];
  const end = header.indexOf("\n");
  if (!filenameId || end < 0) return null;
  try {
    const record = object(JSON.parse(header.slice(0, end)));
    const meta = object(record?.payload);
    const id = meta?.id ?? meta?.session_id;
    if (record?.type !== "session_meta" || !validId(id) || id.toLowerCase() !== filenameId.toLowerCase()) return null;
    if (typeof meta?.cwd !== "string" || !meta.cwd.startsWith("/") || meta.cwd.includes("\0")) return null;

    const source = object(meta.source);
    let parentId: string | undefined;
    let displayName: string | undefined;
    if (source) {
      const spawn = object(object(source.subagent)?.thread_spawn);
      // Guardian, review, compaction and other internal workers are not citizens.
      if (!spawn || !validId(spawn.parent_thread_id)) return null;
      parentId = spawn.parent_thread_id;
      const nickname = meta.agent_nickname ?? spawn.agent_nickname;
      if (typeof nickname === "string" && /^[\p{L}\p{N} _.-]{1,64}$/u.test(nickname)) displayName = nickname;
    } else {
      if (typeof meta.source !== "string" || !["cli", "vscode", "app-server", "exec"].includes(meta.source)) return null;
      if (validId(meta.parent_thread_id)) parentId = meta.parent_thread_id;
    }
    if (parentId === id) return null;
    return { id, cwd: meta.cwd, ...(parentId ? { parentId } : {}), ...(displayName ? { displayName } : {}) };
  } catch { return null; }
}

interface Lifecycle { activity: Activity; completed: boolean; }

/** No prose, prompts, tool arguments or tool output are inspected or published. */
function lifecycle(records: string, previous: Lifecycle): Lifecycle {
  let { activity, completed } = previous;
  for (const line of records.split("\n").slice(0, -1)) {
    try {
      const record = object(JSON.parse(line));
      const payload = object(record?.payload);
      if (record?.type === "response_item") {
        switch (payload?.type) {
          case "reasoning":
          case "function_call_output":
          case "custom_tool_call_output": activity = "thinking"; completed = false; break;
          case "function_call":
          case "custom_tool_call": activity = "running"; completed = false; break;
          case "message":
            if (payload.role === "assistant" && payload.phase === "final_answer") { activity = "idle"; completed = true; }
            break;
        }
        continue;
      }
      if (record?.type !== "event_msg") continue;
      switch (payload?.type) {
        case "task_started":
        case "turn_started": activity = "thinking"; completed = false; break;
        case "task_complete":
        case "turn_complete":
        case "turn_completed":
        case "turn_aborted":
        case "task_aborted":
        case "turn_interrupted": activity = "idle"; completed = true; break;
        case "agent_message":
          if (payload.phase === "final_answer") { activity = "idle"; completed = true; }
          break;
      }
    } catch { /* truncated or unknown records are not lifecycle evidence */ }
  }
  return { activity, completed };
}

export function codexLifecycleActivity(records: string, previous: Activity = "idle"): Activity {
  return lifecycle(records, { activity: previous, completed: false }).activity;
}

async function discoverOpenRollouts(platform: NodeJS.Platform): Promise<OpenRollouts> {
  const commandOptions = { timeout: 3_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" as const };
  // Other users' inaccessible descriptors must not make every local scan incomplete
  // and prevent closed sessions from leaving the city. -U selects the real user.
  const uid = process.getuid?.();
  if (uid == null) return { files: [], complete: false };
  const { stdout } = await pexec("ps", ["-U", String(uid), "-o", "pid=,comm="], commandOptions);
  const pids = parseCodexProcesses(stdout);
  if (!pids.length) return { files: [], complete: true };
  if (platform === "darwin") {
    const { stdout: descriptors } = await pexec("lsof", ["-p", pids.join(","), "-a", "-Fpn"], commandOptions);
    return { files: parseCodexOpenFiles(descriptors, pids), complete: true };
  }

  const files = new Set<string>();
  let complete = true;
  for (const pid of pids) {
    try {
      const dir = `/proc/${pid}/fd`;
      for (const fd of await readdir(dir)) {
        try {
          const path = await readlink(`${dir}/${fd}`);
          if (path.startsWith("/") && ROLLOUT.test(path)) files.add(path);
        } catch (error) {
          // A descriptor closing during enumeration is ordinary. Access failures
          // must not be interpreted as evidence that all sessions have closed.
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") complete = false;
        }
      }
    } catch { complete = false; }
  }
  return { files: [...files], complete };
}

interface CachedRollout {
  metadata: CodexSessionMetadata;
  activity: Activity;
  completed: boolean;
  offset: number;
  identity: string;
}

/** Factory keeps incremental offsets in memory, with bounded reads on each poll. */
export function createCodexScanner(opts: {
  platform?: NodeJS.Platform;
  discover?: () => Promise<OpenRollouts>;
  now?: () => number;
} = {}): CodexScan {
  const platform = opts.platform ?? process.platform;
  const discover = opts.discover ?? (() => discoverOpenRollouts(platform));
  const cache = new Map<string, CachedRollout>();
  return async () => {
    if (!opts.discover && platform !== "darwin" && platform !== "linux") return { sessions: [], complete: false };
    let found: OpenRollouts;
    try { found = await discover(); } catch { return { sessions: [], complete: false }; }
    let complete = found.complete;
    const sessions = new Map<string, AgentEvent>();
    for (const path of new Set(found.files)) {
      // Keep the same admission rule even with an alternate discovery source.
      if (!path.startsWith("/") || !ROLLOUT.test(path)) continue;
      let file: Awaited<ReturnType<typeof open>> | undefined;
      try {
        file = await open(path, "r");
        const stat = await file.stat();
        if (!stat.isFile()) continue;
        const identity = `${stat.dev}:${stat.ino}`;
        let state = cache.get(path);
        if (!state || state.identity !== identity || state.offset > stat.size) {
          const buffer = Buffer.alloc(Math.min(stat.size, HEADER_BYTES));
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          const metadata = parseCodexSessionHeader(buffer.toString("utf8", 0, bytesRead), path);
          if (!metadata) { if (cache.has(path)) complete = false; continue; }
          state = { metadata, activity: "idle", completed: false, offset: 0, identity };
        }
        const start = Math.max(state.offset, stat.size - TAIL_BYTES);
        const buffer = Buffer.alloc(stat.size - start);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
        // Only advance past complete records, so a concurrently appended partial
        // line is read again next poll. Never retain conversation text in cache.
        const lastNewline = buffer.lastIndexOf(10, bytesRead - 1);
        if (bytesRead > 0 && lastNewline >= 0) {
          const first = start > state.offset ? buffer.indexOf(10) + 1 : 0;
          Object.assign(state, lifecycle(buffer.toString("utf8", first, lastNewline + 1), state));
          state.offset = start + lastNewline + 1;
        }
        cache.set(path, state);
        const { metadata, activity } = state;
        // Loaded parent sessions rest between turns. Finished helper threads do
        // not crowd the city merely because the app keeps their file open.
        if (metadata.parentId && state.completed) continue;
        sessions.set(metadata.id, {
          agentKind: "codex", agentId: metadata.id, activity,
          cwd: metadata.cwd, project: basename(metadata.cwd) || metadata.cwd,
          ...(metadata.parentId ? { parentId: metadata.parentId } : {}),
          ...(metadata.displayName ? { displayName: metadata.displayName } : {}),
          ts: (opts.now ?? Date.now)(),
        });
      } catch { complete = false; }
      finally { await file?.close().catch(() => {}); }
    }
    if (found.complete) {
      const present = new Set(found.files);
      for (const path of cache.keys()) if (!present.has(path)) cache.delete(path);
    }
    return { sessions: [...sessions.values()], complete };
  };
}

export function startCodexPresence(opts: {
  report: (event: AgentEvent) => void;
  leave: (id: string) => void;
  tickMs?: number;
  /** Alternate scanner for deterministic lifecycle tests. */
  scan?: CodexScan;
}): { stop(): void; supported: boolean } {
  const supported = !!opts.scan || process.platform === "darwin" || process.platform === "linux";
  if (!supported) return { stop() {}, supported: false };
  const scan = opts.scan ?? createCodexScanner();
  const misses = new Map<string, number>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const result = await scan();
      if (stopped) return;
      const present = new Set<string>();
      for (const event of result.sessions) {
        if (stopped) return;
        present.add(event.agentId);
        misses.set(event.agentId, 0);
        opts.report(event);
      }
      if (result.complete) {
        for (const [id, missed] of misses) {
          if (stopped) return;
          if (present.has(id)) continue;
          if (missed + 1 >= 2) { misses.delete(id); opts.leave(id); }
          else misses.set(id, missed + 1);
        }
      }
    } catch { /* discovery and consumer failures do not declare absent sessions */ }
    finally {
      if (!stopped) timer = setTimeout(() => void tick(), Math.max(1, opts.tickMs ?? 4_000));
    }
  };
  void tick();
  return { supported: true, stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
