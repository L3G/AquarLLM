/** Headless harness: run the embedded server + presence without Electron, for testing. */
import { join } from "node:path";
import { homedir } from "node:os";
import { startServer } from "./server.ts";
import { startHypnos } from "./hypnos.ts";

const PORT = Number(process.env.PORT ?? 8799);
const clientDir = process.env.CLIENT_DIR ?? join(__dirname, "..", "..", "client", "dist");

startServer({ port: PORT, clientDir }).then((server) => {
  console.log(`standalone server on :${PORT} serving ${clientDir}`);
  const h = startHypnos({
    projectsDir: join(homedir(), ".claude", "projects"),
    report: (id, proj) => { if (server.world.presence(id, proj, proj, Date.now())) server.broadcast(); },
    leave: (id) => { if (server.world.apply({ agentKind: "claude", agentId: id, activity: "left", ts: Date.now() })) server.broadcast(); },
  });
  console.log("hypnos supported:", h.supported);
});
