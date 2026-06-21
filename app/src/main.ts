/**
 * AquarLLM desktop app (Electron). A menu-bar/tray app: one embedded server serves the
 * city + ingests events, Hypnos detects open instances, and the Claude hooks are
 * auto-installed. The window just loads the city from the local server.
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from "electron";
import { join } from "node:path";
import { homedir } from "node:os";
import { startServer, type ServerHandle } from "./server.ts";
import { startHypnos, type HypnosHandle } from "./hypnos.ts";
import { installHooks, uninstallHooks, hooksStatus } from "./hooks.ts";

const PORT = 8787;
let server: ServerHandle | null = null;
let hypnos: HypnosHandle | null = null;
let tray: Tray | null = null;
let win: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(init);
}

function clientDir(): string {
  return app.isPackaged ? join(process.resourcesPath, "client") : join(__dirname, "..", "..", "client", "dist");
}

async function init(): Promise<void> {
  if (process.platform === "darwin") app.dock?.hide(); // live in the menu bar
  server = await startServer({ port: PORT, clientDir: clientDir() });
  hypnos = startHypnos({
    projectsDir: join(homedir(), ".claude", "projects"),
    report: (id, proj) => { if (server!.world.presence(id, proj, proj, Date.now())) server!.broadcast(); },
    leave: (id) => { if (server!.world.apply({ agentKind: "claude", agentId: id, activity: "left", ts: Date.now() })) server!.broadcast(); },
  });
  try { if (!hooksStatus(PORT).installed) installHooks(PORT); } catch (e) { console.error("hook install failed:", e); }
  createTray();
  showWindow();
  setInterval(updateTray, 4000);

  app.on("activate", () => showWindow());
  app.on("window-all-closed", () => { /* stay alive in the menu bar */ });
}

function trayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(join(__dirname, "..", "assets", "tray.png"));
  if (process.platform === "darwin") img.setTemplateImage(true);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function createTray(): void {
  tray = new Tray(trayIcon());
  tray.setToolTip("AquarLLM — The Living City");
  updateTray();
}

function updateTray(): void {
  if (!tray) return;
  const n = server?.world.size ?? 0;
  const installed = hooksStatus(PORT).installed;
  const hyp = hypnos?.supported ? "auto-detect on" : "hooks-only (this OS)";
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `AquarLLM · ${n} in the city`, enabled: false },
    { label: hyp, enabled: false },
    { type: "separator" },
    { label: "Open city window", click: () => showWindow() },
    { label: "Open in browser", click: () => shell.openExternal(`http://localhost:${PORT}/`) },
    {
      label: installed ? "Claude hooks: installed ✓ (click to remove)" : "Install Claude hooks",
      click: () => { try { installed ? uninstallHooks() : installHooks(PORT); } catch (e) { console.error(e); } updateTray(); },
    },
    { type: "separator" },
    { label: "Quit AquarLLM", click: () => quit() },
  ]));
  if (process.platform === "darwin") tray.setTitle(n ? ` ${n}` : "");
}

function showWindow(): void {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 800, minHeight: 560,
    backgroundColor: "#0c0d12", title: "AquarLLM — The Living City",
    webPreferences: { contextIsolation: true },
  });
  win.loadURL(`http://localhost:${PORT}/`);
}

function quit(): void {
  try { server?.close(); hypnos?.stop(); } catch { /* ignore */ }
  app.exit(0);
}
