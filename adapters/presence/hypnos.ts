/**
 * Hypnos — zero-touch presence daemon (Greek god of sleep).
 *
 * Finds every running Claude Code instance (process → cwd via `lsof`), recovers each
 * one's session_id from the newest transcript in its project dir, and posts a presence
 * heartbeat to Hermes. Because it keys on the *real* session_id, a sleeping presence
 * avatar and its live (hook-driven) avatar are the SAME character — no duplicates.
 * Instances appear asleep the moment Hypnos runs, with no interaction; when an
 * instance's process exits, Hypnos reports it gone.
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

/** cwds of all running `claude` processes — one cwd ≈ one open instance. */
async function openCwds(): Promise<Set<string>> {
  const pids: string[] = [];
  for (const line of (await sh(["ps", "-Ao", "pid=,comm="])).split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m && basename(m[2]!.trim()) === "claude") pids.push(m[1]!);
  }
  const cwds = new Set<string>();
  if (!pids.length) return cwds;
  for (const line of (await sh(["lsof", "-p", pids.join(","), "-a", "-d", "cwd", "-Fn"])).split("\n")) {
    if (line[0] === "n" && line[1] === "/") cwds.add(line.slice(1));
  }
  return cwds;
}

/** session_id of the most recently active session in a cwd's project dir. */
function sessionForCwd(cwd: string): string | null {
  const dir = `${PROJECTS}/${sanitize(cwd)}`;
  let best: { id: string; m: number } | null = null;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const m = statSync(`${dir}/${f}`).mtimeMs;
      if (!best || m > best.m) best = { id: f.slice(0, -6), m };
    }
  } catch {
    // project dir may not exist yet
  }
  return best?.id ?? null;
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
  const present = new Set<string>();
  for (const cwd of await openCwds()) {
    const id = sessionForCwd(cwd);
    if (!id) continue;
    present.add(id);
    misses.set(id, 0);
    await ping(id, basename(cwd));
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
  console.log(`Hypnos: ${present.size} open instance(s) present`);
}

console.log(`Hypnos → presence heartbeat to ${HERMES} every ${TICK_MS}ms`);
await tick();
setInterval(tick, TICK_MS);
