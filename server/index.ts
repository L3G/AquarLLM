/**
 * Hermes — AquarLLM's event hub.
 *   POST /ingest             canonical Logos AgentEvent (Eidolon, Codex/Grok/private)
 *   POST /ingest/claude-hook raw Claude Code hook JSON (normalized server-side)
 *   GET  /ws                 WebSocket; receives a world snapshot on connect + on change
 *   GET  /healthz            liveness + agent count
 */
import type { Server, ServerWebSocket } from "bun";
import { type AgentEvent, type LogEntry, defaultDisplayName } from "@aquarllm/shared";
import { World } from "./world.ts";
import { normalizeClaudeHook } from "./normalize.ts";
import { normalizeGrokHook } from "./normalize-grok.ts";

const PORT = Number(process.env.PORT ?? 8787);
// Keep open instances around even while idle for hours; SessionEnd removes them on
// close, and this long timeout is just a safety net for crashed sessions.
const REAP_AFTER_MS = Number(process.env.REAP_AFTER_MS ?? 6 * 60 * 60 * 1000); // 6h
const WORLD_TOPIC = "world";

const world = new World();

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function broadcast(server: Server): void {
  server.publish(WORLD_TOPIC, JSON.stringify(world.snapshot()));
}

/** Build an activity-feed line if this event is a meaningful action (vs. a no-op repeat). */
function makeLog(ev: AgentEvent, prev: AgentState | undefined): LogEntry | null {
  const changed = !prev || prev.activity !== ev.activity || (!!ev.detail && prev.detail !== ev.detail);
  if (!changed) return null;
  return {
    ts: ev.ts || Date.now(),
    agentId: ev.agentId,
    agentKind: ev.agentKind,
    project: ev.project ?? prev?.project,
    displayName: ev.displayName ?? prev?.displayName ?? defaultDisplayName(ev.agentKind, ev.agentId),
    activity: ev.activity,
    detail: ev.detail,
  };
}

/** Apply an event, append a log line if it's an action, and broadcast both. */
function record(server: Server, ev: AgentEvent): void {
  const prev = world.peek(ev.agentId);
  const entry = makeLog(ev, prev);
  const changed = world.apply(ev);
  if (entry) {
    world.pushLog(entry);
    server.publish(WORLD_TOPIC, JSON.stringify({ type: "log", entries: [entry] }));
  }
  if (changed) broadcast(server);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("expected websocket", { status: 426 });
    }

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, agents: world.size }, { headers: CORS });
    }

    if (req.method === "POST" && url.pathname === "/ingest") {
      try {
        const body = (await req.json()) as AgentEvent;
        if (!body?.agentId || !body?.activity || !body?.agentKind) {
          return Response.json({ ok: false, error: "invalid event" }, { status: 400, headers: CORS });
        }
        if (!body.ts) body.ts = Date.now();
        record(server, body);
        return Response.json({ ok: true }, { headers: CORS });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400, headers: CORS });
      }
    }

    if (req.method === "POST" && url.pathname === "/ingest/claude-hook") {
      // Fire-and-forget: always answer 200 so a live Claude session is never blocked.
      try {
        const event = normalizeClaudeHook(await req.json());
        if (event) record(server, event);
      } catch {
        // swallow malformed payloads
      }
      return new Response("ok", { headers: CORS });
    }

    if (req.method === "POST" && url.pathname === "/ingest/grok-hook") {
      try {
        const event = normalizeGrokHook(await req.json());
        if (event) record(server, event);
      } catch {
        // swallow malformed payloads
      }
      return new Response("ok", { headers: CORS });
    }

    if (req.method === "POST" && url.pathname === "/ingest/presence") {
      // Heartbeat from Hypnos: an open instance exists (sleeping unless hooks say otherwise).
      try {
        const p = (await req.json()) as { agentId?: string; project?: string; displayName?: string };
        if (p?.agentId && world.presence(p.agentId, p.project, p.displayName, Date.now())) {
          broadcast(server);
        }
      } catch {
        // ignore malformed payloads
      }
      return new Response("ok", { headers: CORS });
    }

    if (url.pathname === "/") {
      return new Response("AquarLLM · Hermes is running. Connect Agora to ws://…/ws", {
        headers: CORS,
      });
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
  websocket: {
    open(ws: ServerWebSocket) {
      ws.subscribe(WORLD_TOPIC);
      ws.send(JSON.stringify(world.snapshot()));
      ws.send(JSON.stringify({ type: "log", entries: world.recentLog() }));
    },
    close(ws: ServerWebSocket) {
      ws.unsubscribe(WORLD_TOPIC);
    },
    message() {
      // clients are read-only for now
    },
  },
});

setInterval(() => {
  if (world.reap(REAP_AFTER_MS).length) broadcast(server);
}, 30_000);

console.log(
  `Hermes listening on http://localhost:${PORT}\n` +
    `  POST /ingest · POST /ingest/claude-hook · WS /ws · GET /healthz`,
);
