/**
 * Embedded Hermes — a Node (http + ws) port of the Bun server, so it can run inside
 * Electron's main process. Serves the built city client AND ingests events:
 *   POST /ingest, /ingest/claude-hook, /ingest/presence · GET /ws, /healthz · static.
 * Reuses the canonical World reducer + Claude-hook normalizer.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { type AgentEvent, type AgentState, type LogEntry, defaultDisplayName } from "@aquarllm/shared";
import { World } from "../../server/world.ts";
import { normalizeClaudeHook } from "../../server/normalize.ts";

const REAP_AFTER_MS = 6 * 60 * 60 * 1000;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json",
};
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export interface ServerHandle {
  world: World;
  port: number;
  broadcast(): void;
  close(): void;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
    req.on("error", () => resolve(""));
  });
}

function makeLog(ev: AgentEvent, prev: AgentState | undefined): LogEntry | null {
  const changed = !prev || prev.activity !== ev.activity || (!!ev.detail && prev.detail !== ev.detail);
  if (!changed) return null;
  return {
    ts: ev.ts || Date.now(), agentId: ev.agentId, agentKind: ev.agentKind,
    project: ev.project ?? prev?.project,
    displayName: ev.displayName ?? prev?.displayName ?? defaultDisplayName(ev.agentKind, ev.agentId),
    activity: ev.activity, detail: ev.detail,
  };
}

export function startServer(opts: { port: number; clientDir: string }): Promise<ServerHandle> {
  const world = new World();
  const clients = new Set<WebSocket>();
  const send = (msg: string) => { for (const c of clients) if (c.readyState === 1) c.send(msg); };
  const broadcast = () => send(JSON.stringify(world.snapshot()));

  const record = (ev: AgentEvent) => {
    const prev = world.peek(ev.agentId);
    const entry = makeLog(ev, prev);
    const changed = world.apply(ev);
    if (entry) { world.pushLog(entry); send(JSON.stringify({ type: "log", entries: [entry] })); }
    if (changed) broadcast();
  };

  const serveStatic = (pathname: string, res: ServerResponse) => {
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const full = normalize(join(opts.clientDir, rel));
    if (!full.startsWith(normalize(opts.clientDir) + sep) && full !== normalize(join(opts.clientDir, "index.html"))) {
      res.writeHead(403).end("forbidden"); return;
    }
    if (!existsSync(full) || !statSync(full).isFile()) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(full)] || "application/octet-stream" });
    res.end(readFileSync(full));
  };

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "OPTIONS") { res.writeHead(204, CORS).end(); return; }

    if (path === "/healthz") { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, agents: world.size })); return; }

    if (req.method === "POST" && path === "/ingest") {
      try {
        const body = JSON.parse(await readBody(req)) as AgentEvent;
        if (!body?.agentId || !body?.activity || !body?.agentKind) { res.writeHead(400, CORS).end('{"ok":false}'); return; }
        if (!body.ts) body.ts = Date.now();
        record(body);
      } catch { /* ignore */ }
      res.writeHead(200, CORS).end('{"ok":true}'); return;
    }
    if (req.method === "POST" && path === "/ingest/claude-hook") {
      try { const ev = normalizeClaudeHook(JSON.parse(await readBody(req))); if (ev) record(ev); } catch { /* ignore */ }
      res.writeHead(200, CORS).end("ok"); return;
    }
    if (req.method === "POST" && path === "/ingest/presence") {
      try { const p = JSON.parse(await readBody(req)); if (p?.agentId && world.presence(p.agentId, p.project, p.displayName, Date.now())) broadcast(); } catch { /* ignore */ }
      res.writeHead(200, CORS).end("ok"); return;
    }

    serveStatic(path, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    if (new URL(req.url || "/", "http://localhost").pathname !== "/ws") { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify(world.snapshot()));
      ws.send(JSON.stringify({ type: "log", entries: world.recentLog() }));
      ws.on("close", () => clients.delete(ws));
      ws.on("error", () => clients.delete(ws));
    });
  });

  const reaper = setInterval(() => { if (world.reap(REAP_AFTER_MS).length) broadcast(); }, 30_000);

  return new Promise((resolve) => {
    httpServer.listen(opts.port, () => resolve({
      world, port: opts.port, broadcast,
      close: () => { clearInterval(reaper); for (const c of clients) c.close(); wss.close(); httpServer.close(); },
    }));
  });
}
