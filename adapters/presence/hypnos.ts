/**
 * Hypnos — zero-touch presence daemon (Greek god of sleep).
 *
 * Finds every running Claude Code instance and posts a presence heartbeat to Hermes,
 * so open instances appear asleep with no interaction. Multiple instances can share a
 * folder, so per folder it counts the live (terminal) `claude` processes and presences
 * that many of the newest transcripts — each transcript's filename is the session_id
 * the hooks use, so sleepers and live avatars are the same character (no duplicates).
 * VS Code's native-binary helper processes collapse to a single session. When an
 * instance's process exits, its avatar is removed.
 *
 *   bun run adapters/presence/hypnos.ts
 *   HERMES_URL=http://host:port TICK_MS=12000 bun run adapters/presence/hypnos.ts
 *
 * macOS-specific (uses `ps` + `lsof`). Read-only: it never touches your sessions.
 */
import { readdirSync, statSync } from "node:fs";

const HERMES = process.env.HERMES_URL ?? "http://localhost:8787";
const HOME = process.env.HOME ?? "";
const PROJECTS = `${HOME}/.claude/projects`;
const TICK_MS = Number(process.env.TICK_MS ?? 12000);
const MISS_GRACE = 2; // ticks an instance may be missing before we report it gone

const sanitize = (cwd: string): string => cwd.replace(/\//g, "-");
const basename = (p: string): string => p.replace(/\/+$/, "").split("/").pop() || p;

async function sh(cmd: string[]): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
    return await new Response(proc.stdout).text();
  } catch {
    return "";
  }
}

/** Running claude processes: pid → isTerminal (CLI instance vs VS Code helper). */
async function claudeProcs(): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  for (const line of (await sh(["ps", "-Ao", "pid=,comm=,args="])).split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m || basename(m[2]!) !== "claude") continue;
    map.set(Number(m[1]), !m[3]!.includes("native-binary"));
  }
  return map;
}

/** pid → cwd, via a single lsof call. */
async function cwdByPid(pids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!pids.length) return map;
  let pid = 0;
  for (const line of (await sh(["lsof", "-p", pids.join(","), "-a", "-d", "cwd", "-Fpn"])).split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && line[1] === "/" && pid) map.set(pid, line.slice(1));
  }
  return map;
}

/** The `n` most-recently-active session_ids in a cwd's project dir. */
function sessionsForCwd(cwd: string, n: number): string[] {
  const dir = `${PROJECTS}/${sanitize(cwd)}`;
  const files: Array<{ id: string; m: number }> = [];
  try {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".jsonl")) files.push({ id: f.slice(0, -6), m: statSync(`${dir}/${f}`).mtimeMs });
    }
  } catch {
    // project dir may not exist yet
  }
  return files
    .sort((a, b) => b.m - a.m)
    .slice(0, n)
    .map((f) => f.id);
}

async function ping(agentId: string, project: string): Promise<void> {
  await fetch(`${HERMES}/ingest/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, project, displayName: project }),
  }).catch(() => {});
}

async function leave(agentId: string): Promise<void> {
  await fetch(`${HERMES}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentKind: "claude", agentId, activity: "left", ts: Date.now() }),
  }).catch(() => {});
}

const misses = new Map<string, number>(); // session_id -> consecutive ticks missing

async function tick(): Promise<void> {
  const procs = await claudeProcs();
  const cwds = await cwdByPid([...procs.keys()]);

  // Per folder, count terminal instances (VS Code helpers collapse to one session).
  const folders = new Map<string, { terminal: number; any: number }>();
  for (const [pid, isTerminal] of procs) {
    const cwd = cwds.get(pid);
    if (!cwd) continue;
    const f = folders.get(cwd) ?? { terminal: 0, any: 0 };
    if (isTerminal) f.terminal++;
    f.any++;
    folders.set(cwd, f);
  }

  const present = new Set<string>();
  for (const [cwd, f] of folders) {
    const sessions = f.terminal > 0 ? f.terminal : 1;
    for (const id of sessionsForCwd(cwd, sessions)) {
      present.add(id);
      misses.set(id, 0);
      await ping(id, basename(cwd));
    }
  }

  for (const [id, miss] of misses) {
    if (present.has(id)) continue;
    if (miss + 1 >= MISS_GRACE) {
      await leave(id);
      misses.delete(id);
    } else {
      misses.set(id, miss + 1);
    }
  }

  console.log(`Hypnos: ${folders.size} folder(s), ${present.size} open instance(s)`);
}

console.log(`Hypnos → presence heartbeat to ${HERMES} every ${TICK_MS}ms`);
await tick();
setInterval(tick, TICK_MS);
