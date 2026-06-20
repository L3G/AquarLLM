/**
 * The world reducer. Folds a stream of AgentEvents into a map of live agents.
 * Hermes is authoritative for *intent* (which agent exists, which district it should
 * be in, its bubble text); Agora handles the actual motion/animation.
 */
import {
  type AgentEvent,
  type AgentState,
  type WorldSnapshot,
  ACTIVITY_TO_DISTRICT,
  defaultDisplayName,
} from "@aquarllm/shared";

export class World {
  private agents = new Map<string, AgentState>();

  /** Apply an event. Returns true if state changed (worth broadcasting). */
  apply(event: AgentEvent): boolean {
    const now = event.ts || Date.now();

    if (event.activity === "left") {
      return this.agents.delete(event.agentId);
    }

    const prev = this.agents.get(event.agentId);
    const keepDetail = prev && prev.activity === event.activity ? prev.detail : undefined;

    this.agents.set(event.agentId, {
      agentId: event.agentId,
      agentKind: event.agentKind,
      displayName:
        event.displayName ??
        prev?.displayName ??
        defaultDisplayName(event.agentKind, event.agentId),
      activity: event.activity,
      district: ACTIVITY_TO_DISTRICT[event.activity],
      detail: event.detail ?? keepDetail,
      project: event.project ?? prev?.project,
      parentId: event.parentId ?? prev?.parentId,
      lastUpdate: now,
    });
    return true;
  }

  /**
   * A presence heartbeat from the Hypnos daemon: an open Claude Code instance exists.
   * Keeps a known session alive regardless of state, or creates a new *sleeping* (idle)
   * avatar for one that hasn't emitted any hook yet. Never overrides an actively-working
   * session. Returns true only when a brand-new avatar is created (worth broadcasting).
   */
  presence(agentId: string, project: string | undefined, displayName: string | undefined, now: number): boolean {
    const prev = this.agents.get(agentId);
    if (prev) {
      prev.lastUpdate = now; // keep the open session alive; let hooks drive its activity
      if (prev.activity === "idle" && project) prev.project = project;
      return false;
    }
    this.agents.set(agentId, {
      agentId,
      agentKind: "claude",
      displayName: displayName ?? project ?? defaultDisplayName("claude", agentId),
      activity: "idle",
      district: ACTIVITY_TO_DISTRICT.idle,
      project,
      lastUpdate: now,
    });
    return true;
  }

  /** Remove agents not heard from within `ms` (sessions that died ungracefully). */
  reap(ms: number, now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [id, a] of this.agents) {
      if (now - a.lastUpdate > ms) {
        this.agents.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  snapshot(): WorldSnapshot {
    return { type: "snapshot", agents: [...this.agents.values()] };
  }

  get size(): number {
    return this.agents.size;
  }
}
