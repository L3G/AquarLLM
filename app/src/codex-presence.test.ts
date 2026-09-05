import { describe, expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@aquarllm/shared";
import {
  codexLifecycleActivity, createCodexScanner, parseCodexOpenFiles,
  parseCodexProcesses, parseCodexSessionHeader, startCodexPresence,
  type CodexScanResult,
} from "./codex-presence.ts";

const ID = "019eb782-49ac-7e72-b89d-c38668475577";
const CHILD = "019eb782-49ac-7e72-b89d-c38668475578";
const PATH = `/home/person/.codex/sessions/2026/09/04/rollout-2026-09-04T10-00-00-${ID}.jsonl`;
const record = (type: string, payload: object) => `${JSON.stringify({ type, payload })}\n`;
const event = (type: string) => record("event_msg", { type });
const header = (overrides: object = {}) => record("session_meta", {
  id: ID, cwd: "/work/my project", source: "vscode", ...overrides,
});
const citizen: AgentEvent = { agentKind: "codex", agentId: ID, activity: "thinking", cwd: "/work/app", ts: 123 };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "aquarllm-codex-"));
  const dir = join(root, "sessions", "2026", "09", "04");
  await mkdir(dir, { recursive: true });
  return {
    path: join(dir, `rollout-2026-09-04T10-00-00-${ID}.jsonl`),
    child: join(dir, `rollout-2026-09-04T10-00-00-${CHILD}.jsonl`),
    close: () => rm(root, { recursive: true, force: true }),
  };
}

describe("Codex process and rollout discovery", () => {
  test("matches the executable exactly, including paths with spaces", () => {
    expect(parseCodexProcesses([
      "  42 /Applications/Visual Studio Code.app/extensions/bin/codex",
      "  43 /Users/person/bin/codex-code-mode-host", "44 /bin/codex-helper",
      "45 codex", "46 /usr/bin/node", "47 /bin/not-codex",
    ].join("\n"))).toEqual(["42", "45"]);
  });

  test("accepts only rollout descriptors belonging to selected Codex processes", () => {
    expect(parseCodexOpenFiles([
      `n${PATH}`, "p43", `n${PATH}`, "p42", "n/home/person/.codex/state.sqlite",
      "n/home/person/.codex/sessions/history.jsonl", `n${PATH}`, `n${PATH}`,
      `n${PATH} (deleted)`, "p99", `n${PATH.replace(ID, CHILD)}`,
    ].join("\n"), ["42"])).toEqual([PATH]);
  });

  test("requires matching metadata identity, an absolute cwd and a complete record", () => {
    expect(parseCodexSessionHeader(header(), PATH)).toEqual({ id: ID, cwd: "/work/my project" });
    expect(parseCodexSessionHeader(header({ id: undefined, session_id: ID }), PATH)?.id).toBe(ID);
    for (const invalid of [header({ id: CHILD }), header({ id: "unsafe/id" }), header({ cwd: "relative" }),
      header({ cwd: "/path\0oops" }), header().trimEnd(), "garbage\n", header({ source: "unknown" })]) {
      expect(parseCodexSessionHeader(invalid, PATH)).toBeNull();
    }
  });

  test("preserves real helper identity and excludes internal workers", () => {
    const source = { subagent: { thread_spawn: { parent_thread_id: ID, agent_nickname: "Kepler" } } };
    expect(parseCodexSessionHeader(header({ id: CHILD, source }), PATH.replace(ID, CHILD)))
      .toEqual({ id: CHILD, cwd: "/work/my project", parentId: ID, displayName: "Kepler" });
    expect(parseCodexSessionHeader(header({ source: { subagent: { other: "guardian" } } }), PATH)).toBeNull();
    expect(parseCodexSessionHeader(header({ source: { subagent: "review" } }), PATH)).toBeNull();
    expect(parseCodexSessionHeader(header({ source }), PATH)).toBeNull(); // self-parent
  });
});

describe("bounded Codex activity parsing", () => {
  test("observes lifecycle records, preserving the latest complete event", () => {
    expect(codexLifecycleActivity(event("task_started"))).toBe("thinking");
    expect(codexLifecycleActivity(event("task_started") + event("task_complete"))).toBe("idle");
    expect(codexLifecycleActivity(event("task_complete") + event("turn_started"))).toBe("thinking");
    expect(codexLifecycleActivity(event("turn_aborted"), "running")).toBe("idle");
    expect(codexLifecycleActivity(event("task_started") + event("task_complete").trimEnd())).toBe("thinking");
    expect(codexLifecycleActivity("broken\n" + record("event_msg", { type: "future_event" }), "running")).toBe("running");
  });

  test("uses explicit response types and phases without deriving activity from contents", () => {
    expect(codexLifecycleActivity(record("response_item", { type: "reasoning", content: "secret" }))).toBe("thinking");
    expect(codexLifecycleActivity(record("response_item", { type: "function_call", name: "anything", arguments: "secret" }))).toBe("running");
    expect(codexLifecycleActivity(record("response_item", { type: "function_call_output", output: "task_complete" }))).toBe("thinking");
    expect(codexLifecycleActivity(record("response_item", { type: "message", role: "assistant", phase: "final_answer" }), "running")).toBe("idle");
    expect(codexLifecycleActivity(record("response_item", { type: "message", role: "user", phase: "final_answer", content: "task_complete" }), "running")).toBe("running");
    expect(codexLifecycleActivity(record("event_msg", { type: "agent_message", message: "task_complete" }), "thinking")).toBe("thinking");
  });

  test("reads only discovered files, even when a newer saved session exists nearby", async () => {
    const f = await fixture();
    try {
      await writeFile(f.path, header() + event("task_started"));
      await writeFile(f.child, header({ id: CHILD }) + event("task_started"));
      const scan = createCodexScanner({ discover: async () => ({ files: [f.path], complete: true }), now: () => 456 });
      expect(await scan()).toEqual({ complete: true, sessions: [{
        agentKind: "codex", agentId: ID, activity: "thinking", cwd: "/work/my project", project: "my project", ts: 456,
      }] });
      const none = createCodexScanner({ discover: async () => ({ files: [], complete: true }) });
      expect((await none()).sessions).toEqual([]);
    } finally { await f.close(); }
  });

  test("reassembles a concurrent partial record and keeps incremental state", async () => {
    const f = await fixture();
    try {
      await writeFile(f.path, header() + event("task_started"));
      const scan = createCodexScanner({ discover: async () => ({ files: [f.path], complete: true }) });
      expect((await scan()).sessions[0]?.activity).toBe("thinking");
      const completed = event("task_complete");
      await appendFile(f.path, completed.slice(0, -3));
      expect((await scan()).sessions[0]?.activity).toBe("thinking");
      await appendFile(f.path, completed.slice(-3));
      expect((await scan()).sessions[0]?.activity).toBe("idle");
      expect((await scan()).sessions[0]?.activity).toBe("idle");
      await writeFile(f.path, header() + event("turn_started")); // truncated/replaced rollout
      expect((await scan()).sessions[0]?.activity).toBe("thinking");
    } finally { await f.close(); }
  });

  test("handles huge records with a bounded tail and hides only explicitly finished helpers", async () => {
    const f = await fixture();
    try {
      const childHeader = header({ id: CHILD, source: { subagent: { thread_spawn: { parent_thread_id: ID } } } });
      await writeFile(f.child, childHeader + event("task_started") + record("response_item", {
        type: "function_call_output", output: "private data ".repeat(40_000),
      }) + record("response_item", { type: "reasoning" }));
      const scan = createCodexScanner({ discover: async () => ({ files: [f.child], complete: true }) });
      expect((await scan()).sessions[0]?.activity).toBe("thinking");
      await appendFile(f.child, event("task_complete"));
      expect((await scan()).sessions).toEqual([]);
      await appendFile(f.child, event("task_started"));
      expect((await scan()).sessions[0]?.parentId).toBe(ID);
      const unknown = createCodexScanner({ discover: async () => ({ files: [f.child], complete: true }) });
      await writeFile(f.child, childHeader); // missing lifecycle evidence is not completed
      expect((await unknown()).sessions[0]?.activity).toBe("idle");
    } finally { await f.close(); }
  });

  test("failed discovery and unreadable files are inconclusive, not confirmed absence", async () => {
    const rejected = createCodexScanner({ discover: async () => { throw new Error("ps denied"); } });
    expect(await rejected()).toEqual({ sessions: [], complete: false });
    const f = await fixture();
    try {
      const missing = createCodexScanner({ discover: async () => ({ files: [f.path], complete: true }) });
      expect(await missing()).toEqual({ sessions: [], complete: false });
    } finally { await f.close(); }
  });
});

describe("Codex presence poll lifecycle", () => {
  test("requires two confirmed misses and preserves citizens through discovery failures", async () => {
    const results: CodexScanResult[] = [
      { sessions: [citizen], complete: true }, { sessions: [], complete: false },
      { sessions: [], complete: true }, { sessions: [], complete: false }, { sessions: [], complete: true },
    ];
    const reports: AgentEvent[] = [];
    const leaves: string[] = [];
    let calls = 0;
    const handle = startCodexPresence({
      tickMs: 1, scan: async () => results[Math.min(calls++, results.length - 1)]!,
      report: (ev) => reports.push(ev), leave: (id) => { leaves.push(id); handle.stop(); },
    });
    try {
      await Bun.sleep(40);
      expect(reports).toEqual([citizen]);
      expect(leaves).toEqual([ID]);
      expect(calls).toBe(5);
    } finally { handle.stop(); }
  });

  test("slow scans never overlap, and stop prevents in-flight callbacks", async () => {
    let finish!: (result: CodexScanResult) => void;
    let calls = 0;
    const reports: AgentEvent[] = [];
    const handle = startCodexPresence({ tickMs: 1,
      scan: () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
      report: (ev) => reports.push(ev), leave: () => { throw new Error("unexpected departure"); },
    });
    await Bun.sleep(10);
    expect(calls).toBe(1);
    handle.stop();
    finish({ sessions: [citizen], complete: true });
    await Bun.sleep(10);
    expect(reports).toEqual([]);
    expect(calls).toBe(1);
  });
});
