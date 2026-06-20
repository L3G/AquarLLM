/**
 * Eidolon — phantom agents.
 *
 * Posts a believable stream of canonical Logos events to Hermes so the town is
 * lively before any real agent (Claude/Codex/Grok/local) is wired up. Agents join,
 * cycle through work activities, occasionally spawn subagents, error, and leave.
 *
 *   bun run sim.ts            # defaults to http://localhost:8787
 *   HERMES_URL=... TICK_MS=1200 bun run sim.ts
 */
import type { Activity, AgentEvent, AgentKind } from "@aquarllm/shared";

const HERMES = process.env.HERMES_URL ?? "http://localhost:8787";
const TICK_MS = Number(process.env.TICK_MS ?? 1800);
const MIN_AGENTS = Number(process.env.MIN_AGENTS ?? 4);
const MAX_AGENTS = Number(process.env.MAX_AGENTS ?? 8);

const NAMES = [
  "Atlas", "Nyx", "Hoshi", "Vega", "Kappa", "Mochi",
  "Orion", "Sora", "Pan", "Rhea", "Kaida", "Juno",
];
const KINDS: AgentKind[] = ["claude", "codex", "grok", "custom"];
const PROJECTS = ["newworld", "aquarllm", "eos-stack", "kernel", "webapp", "rustlang", "infra"];
const WORK: Activity[] = ["thinking", "reading", "editing", "running", "searching"];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const chance = (p: number): boolean => Math.random() < p;

interface Persona {
  agentId: string;
  agentKind: AgentKind;
  displayName: string;
  project: string;
  parentId?: string;
  ttl?: number; // remaining ticks for subagents
}

const agents = new Map<string, Persona>();
let nameIdx = 0;

async function emit(ev: Omit<AgentEvent, "ts">): Promise<void> {
  try {
    await fetch(`${HERMES}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ev, ts: Date.now() }),
    });
  } catch {
    // Hermes may not be up yet; keep ticking.
  }
}

function detailFor(activity: Activity): string | undefined {
  switch (activity) {
    case "reading":
      return pick(["README.md", "world.ts", "index.ts", "auth.go", "main.rs", "schema.sql"]);
    case "editing":
      return pick(["world.ts", "character.ts", "router.tsx", "models.py", "Cargo.toml"]);
    case "running":
      return pick(["bun test", "npm run build", "cargo check", "git status", "make"]);
    case "searching":
      return pick(["pixijs isometric", "bun websocket", "a* pathfinding", "rust lifetimes"]);
    case "thinking":
      return pick(["planning refactor", "designing API", "triaging a bug"]);
    case "waiting":
      return "needs your input";
    default:
      return undefined;
  }
}

function newPersona(): Persona {
  return {
    agentId: crypto.randomUUID().slice(0, 8),
    agentKind: pick(KINDS),
    displayName: NAMES[nameIdx++ % NAMES.length]!,
    project: pick(PROJECTS),
  };
}

async function transition(p: Persona, activity: Activity): Promise<void> {
  await emit({
    agentKind: p.agentKind,
    agentId: p.agentId,
    displayName: p.displayName,
    activity,
    project: p.project,
    parentId: p.parentId,
    detail: detailFor(activity),
  });
}

async function spawnSubagent(parent: Persona): Promise<void> {
  const sub: Persona = {
    agentId: crypto.randomUUID().slice(0, 8),
    agentKind: parent.agentKind,
    displayName: `${parent.displayName}·sub`,
    project: parent.project,
    parentId: parent.agentId,
    ttl: 3 + Math.floor(Math.random() * 4),
  };
  agents.set(sub.agentId, sub);
  await transition(sub, "reading");
}

async function tick(): Promise<void> {
  // Keep a baseline population (and let it breathe up to MAX).
  if (agents.size < MIN_AGENTS || (agents.size < MAX_AGENTS && chance(0.2))) {
    const p = newPersona();
    agents.set(p.agentId, p);
    await transition(p, "joined");
    return;
  }

  const p = pick([...agents.values()]);
  const isSub = p.parentId !== undefined;

  // Subagents are short-lived.
  if (isSub && p.ttl !== undefined) {
    if (--p.ttl <= 0) {
      agents.delete(p.agentId);
      await emit({ agentKind: p.agentKind, agentId: p.agentId, activity: "left", parentId: p.parentId });
      return;
    }
  }

  // Main agents occasionally leave...
  if (!isSub && agents.size > MIN_AGENTS && chance(0.06)) {
    agents.delete(p.agentId);
    await emit({ agentKind: p.agentKind, agentId: p.agentId, activity: "left" });
    return;
  }

  // ...or spawn a helper...
  if (!isSub && chance(0.12)) {
    await transition(p, "spawning");
    await spawnSubagent(p);
    return;
  }

  // ...or hit a transient error...
  if (chance(0.05)) {
    await transition(p, "error");
    return;
  }

  // ...otherwise just move to a new activity.
  const next: Activity = chance(0.12) ? "idle" : chance(0.1) ? "waiting" : pick(WORK);
  await transition(p, next);
}

console.log(`Eidolon → ${HERMES}/ingest every ${TICK_MS}ms (population ${MIN_AGENTS}-${MAX_AGENTS})`);
await tick();
setInterval(tick, TICK_MS);
