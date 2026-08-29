/**
 * Clio — the muse of history.
 *
 * Inspects a working directory's git repo (history + size) and caches the result, so the
 * town can be grouped into *villages* (one per repo) sized by real commits / age /
 * contributors / files. Inspection is async and cached: `resolve(cwd)` returns instantly
 * (a cached repo id, or `undefined` while it inspects) and never blocks the hook path.
 *
 * Folders that share a git root resolve to the same village id (the toplevel path), so
 * worktrees / monorepo subdirs cluster together. Non-git folders resolve to `undefined`,
 * and the client synthesizes playful stats from the project name instead.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepoInfo } from "@aquarllm/shared";

const pexec = promisify(execFile);
const REFRESH_MS = 5 * 60 * 1000; // re-inspect a repo at most this often

const base = (p: string): string => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

interface Entry {
  info: RepoInfo;
  checked: number;
}

export class Clio {
  private cwdToRoot = new Map<string, string | null>(); // cwd -> repo root (null = not a repo)
  private repos = new Map<string, Entry>(); // root -> info
  private inflight = new Set<string>(); // cwds currently being inspected
  private cb: (() => void) | null = null;

  /** Called whenever a repo's info is first learned or refreshed. */
  onUpdate(cb: () => void): void {
    this.cb = cb;
  }

  /** All known repos, for the `repos` WS message. */
  list(): RepoInfo[] {
    return [...this.repos.values()].map((e) => e.info);
  }

  /**
   * Village id for a cwd. Returns the cached root immediately; on the first sighting of a
   * cwd it schedules an async inspection and returns undefined (a later event — or the
   * onUpdate relabel — picks up the resolved id).
   */
  resolve(cwd: string | undefined): string | undefined {
    if (!cwd) return undefined;
    const known = this.cwdToRoot.get(cwd);
    if (known === null) return undefined; // known non-repo
    if (known !== undefined) {
      const e = this.repos.get(known);
      if (!e || Date.now() - e.checked > REFRESH_MS) void this.inspect(cwd); // refresh in bg
      return known;
    }
    void this.inspect(cwd); // first time seeing this cwd
    return undefined;
  }

  private async inspect(cwd: string): Promise<void> {
    if (this.inflight.has(cwd)) return;
    this.inflight.add(cwd);
    try {
      const root = (await this.git(cwd, ["rev-parse", "--show-toplevel"])).trim();
      if (!root) {
        this.cwdToRoot.set(cwd, null);
        return;
      }
      this.cwdToRoot.set(cwd, root);
      const prev = this.repos.get(root);
      if (prev && Date.now() - prev.checked < REFRESH_MS) return; // fresh enough
      const info = await this.stat(root);
      this.repos.set(root, { info, checked: Date.now() });
      this.cb?.();
    } catch {
      this.cwdToRoot.set(cwd, null); // not a repo / git unavailable
    } finally {
      this.inflight.delete(cwd);
    }
  }

  private async stat(root: string): Promise<RepoInfo> {
    const num = (s: string): number => Number(s.trim()) || 0;
    const lines = (s: string): number => s.trim().split("\n").filter(Boolean).length;

    const commits = num(await this.git(root, ["rev-list", "--count", "HEAD"]).catch(() => "0"));
    // Root commits are the initial commits; git logs newest-first, so the last line is the
    // oldest — that's the repo's founding date.
    const founding = (await this.git(root, ["log", "--max-parents=0", "--format=%cI", "HEAD"]).catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .pop();
    const ageDays = founding ? Math.max(0, Math.round((Date.now() - Date.parse(founding)) / 864e5)) : 0;
    const contributors = lines(await this.git(root, ["shortlog", "-sne", "HEAD"]).catch(() => "")) || 1;
    const files = lines(await this.git(root, ["ls-files"]).catch(() => ""));
    // Top-level directories — each becomes a labelled "portion of the repo" house.
    // Skip dotfolders (.github, .vscode…) so houses map to substantive source folders.
    const dirs = (await this.git(root, ["ls-tree", "-d", "--name-only", "HEAD"]).catch(() => ""))
      .trim().split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith(".")).slice(0, 30);

    return { id: root, name: base(root), root, commits, ageDays, contributors, files, dirs, real: true };
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await pexec("git", ["-C", cwd, ...args], {
      maxBuffer: 16 << 20,
      timeout: 8000,
      // shortlog wants a pager off / non-interactive; -c keeps it quiet.
      env: { ...process.env, GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout;
  }
}
