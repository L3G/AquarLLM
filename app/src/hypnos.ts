/**
 * Hypnos (Node, cross-platform presence) — detects open Claude Code instances so they
 * appear asleep without interaction, reporting straight into the embedded world.
 *   macOS:   ps + lsof (cwd)
 *   Linux:   ps + /proc/<pid>/cwd
 *   Windows: unsupported — falls back to hooks-only presence (no-op here)
 */
import { execFile } from "node:child_process";
import { readdirSync, statSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export interface HypnosHandle { stop(): void; supported: boolean; }

interface HypnosOpts {
  projectsDir: string;
  report: (agentId: string, project: string) => void;
  leave: (agentId: string) => void;
  tickMs?: number;
}

const sanitize = (cwd: string) => cwd.replace(/\//g, "-");
const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;

export function startHypnos(opts: HypnosOpts): HypnosHandle {
  const plat = process.platform;
  if (plat !== "darwin" && plat !== "linux") return { stop() {}, supported: false };

  const tickMs = opts.tickMs ?? 12000;
  const MISS_GRACE = 2;
  const misses = new Map<string, number>();

  /** pid → isTerminal (CLI vs editor helper). */
  async function claudeProcs(): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    try {
      const { stdout } = await pexec("ps", ["-Ao", "pid=,comm=,args="], { maxBuffer: 8 << 20 });
      for (const line of stdout.split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
        if (m && base(m[2]!) === "claude") map.set(m[1]!, !m[3]!.includes("native-binary"));
      }
    } catch { /* ps unavailable */ }
    return map;
  }

  async function cwdByPid(pids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!pids.length) return map;
    if (plat === "darwin") {
      try {
        const { stdout } = await pexec("lsof", ["-p", pids.join(","), "-a", "-d", "cwd", "-Fpn"], { maxBuffer: 8 << 20 });
        let pid = "";
        for (const l of stdout.split("\n")) {
          if (l[0] === "p") pid = l.slice(1);
          else if (l[0] === "n" && l[1] === "/" && pid) map.set(pid, l.slice(1));
        }
      } catch { /* lsof unavailable */ }
    } else {
      for (const pid of pids) { try { map.set(pid, readlinkSync(`/proc/${pid}/cwd`)); } catch { /* gone */ } }
    }
    return map;
  }

  function sessionsForCwd(cwd: string, n: number): string[] {
    const dir = join(opts.projectsDir, sanitize(cwd));
    const files: Array<{ id: string; m: number }> = [];
    try {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".jsonl")) files.push({ id: f.slice(0, -6), m: statSync(join(dir, f)).mtimeMs });
      }
    } catch { /* none */ }
    return files.sort((a, b) => b.m - a.m).slice(0, n).map((f) => f.id);
  }

  async function tick(): Promise<void> {
    const procs = await claudeProcs();
    const cwds = await cwdByPid([...procs.keys()]);
    const folders = new Map<string, { terminal: number }>();
    for (const [pid, isTerm] of procs) {
      const cwd = cwds.get(pid);
      if (!cwd) continue;
      const f = folders.get(cwd) ?? { terminal: 0 };
      if (isTerm) f.terminal++;
      folders.set(cwd, f);
    }
    const present = new Set<string>();
    for (const [cwd, f] of folders) {
      const n = f.terminal > 0 ? f.terminal : 1;
      for (const id of sessionsForCwd(cwd, n)) { present.add(id); misses.set(id, 0); opts.report(id, base(cwd)); }
    }
    for (const [id, miss] of misses) {
      if (present.has(id)) continue;
      if (miss + 1 >= MISS_GRACE) { opts.leave(id); misses.delete(id); }
      else misses.set(id, miss + 1);
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), tickMs);
  return { stop() { clearInterval(timer); }, supported: true };
}
