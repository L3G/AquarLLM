/**
 * Hermes — AquarLLM's event hub.
 *   POST /ingest             canonical Logos AgentEvent (Eidolon, Codex/Grok/private)
 *   POST /ingest/claude-hook raw Claude Code hook JSON (normalized server-side)
 *   GET  /ws                 WebSocket; receives a world snapshot on connect + on change
 *   GET  /healthz            liveness + agent count
 */
import type { Server, ServerWebSocket } from "bun";
import type { AgentEvent } from "@aquarllm/shared";
import { World } from "./world.ts";
import { normalizeClaudeHook } from "./normalize.ts";

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
        if (world.apply(body)) broadcast(server);
        return Response.json({ ok: true }, { headers: CORS });
      } catch (e) {
        return Response.json({ ok: false, error: String(e) }, { status: 400, headers: CORS });
      }
    }

    if (req.method === "POST" && url.pathname === "/ingest/claude-hook") {
      // Fire-and-forget: always answer 200 so a live Claude session is never blocked.
      try {
        const event = normalizeClaudeHook(await req.json());
        if (event && world.apply(event)) broadcast(server);
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
