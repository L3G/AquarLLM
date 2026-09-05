/** Headless harness: run the embedded server + presence without Electron, for testing. */
import { join } from "node:path";
import { homedir } from "node:os";
import { startServer } from "./server.ts";
import { startHypnos } from "./hypnos.ts";
import { startCodexPresence } from "./codex-presence.ts";

const PORT = Number(process.env.PORT ?? 8799);
const clientDir = process.env.CLIENT_DIR ?? join(__dirname, "..", "..", "client", "dist");

startServer({ port: PORT, clientDir }).then((server) => {
  console.log(`standalone server on :${PORT} serving ${clientDir}`);
  const h = startHypnos({
    projectsDir: join(homedir(), ".claude", "projects"),
    grokSessionsFile: join(homedir(), ".grok", "active_sessions.json"),
    report: (id, proj, kind, cwd) => { if (server.world.presence(id, proj, proj, Date.now(), kind, cwd, server.resolveRepo(cwd))) server.broadcast(); },
    leave: (id) => { if (server.world.apply({ agentKind: "claude", agentId: id, activity: "left", ts: Date.now() })) server.broadcast(); },
  });
  const codex = startCodexPresence({
    report: (event) => server.record(event),
    leave: (agentId) => server.record({ agentKind: "codex", agentId, activity: "left", ts: Date.now() }),
  });
  const stop = () => { codex.stop(); h.stop(); server.close(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log("hypnos supported:", h.supported);
  console.log("codex presence supported:", codex.supported);
});
