/** Agora — the isometric town renderer. Connects to Hermes and animates agents. */
import { Application, Container } from "pixi.js";
import type { AgentState, WorldSnapshot } from "@aquarllm/shared";
import { Town } from "./map.ts";
import { Character } from "./character.ts";
import { PathFinder } from "./pathfind.ts";
import { connect } from "./net.ts";
import { renderLegend } from "./ui.ts";
import type { Tile } from "./iso.ts";

const HERMES_WS =
  (import.meta.env.VITE_HERMES_WS as string | undefined) ?? "ws://localhost:8787/ws";

const app = new Application();
await app.init({
  background: 0x12141a,
  antialias: false,
  resizeTo: window,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
});
document.getElementById("app")!.appendChild(app.canvas);

// World container: town (project plots) below, depth-sorted entities above.
const world = new Container();
const town = new Town();
const entities = new Container();
entities.sortableChildren = true;
world.addChild(town.layer, entities);
app.stage.addChild(world);

// Camera auto-fits the whole town until the user pans/zooms (press F to resume fit).
let userControlled = false;
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
let dragging = false;
let lastX = 0;
let lastY = 0;
app.stage.on("pointerdown", (e) => {
  dragging = true;
  lastX = e.global.x;
  lastY = e.global.y;
});
const endDrag = () => (dragging = false);
app.stage.on("pointerup", endDrag);
app.stage.on("pointerupoutside", endDrag);
app.stage.on("pointermove", (e) => {
  if (!dragging) return;
  userControlled = true;
  world.x += e.global.x - lastX;
  world.y += e.global.y - lastY;
  lastX = e.global.x;
  lastY = e.global.y;
});
window.addEventListener(
  "wheel",
  (e) => {
    userControlled = true;
    const next = Math.min(3, Math.max(0.3, world.scale.x * Math.exp(-e.deltaY * 0.001)));
    world.scale.set(next);
  },
  { passive: true },
);
window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") userControlled = false;
});

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fitCamera(): void {
  if (userControlled) return;
  const b = town.bounds();
  if (!b) return;
  const margin = 90;
  const w = b.maxX - b.minX + margin * 2;
  const h = b.maxY - b.minY + margin * 2;
  const target = Math.min(2.2, Math.max(0.2, Math.min(app.screen.width / w, app.screen.height / h)));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  // Snap out instantly so the whole town is always framed; ease in when it shrinks.
  const t = target < world.scale.x - 0.0005 ? 1 : 0.08;
  const s = lerp(world.scale.x, target, t);
  world.scale.set(s);
  world.x = lerp(world.x, app.screen.width / 2 - cx * s, t);
  world.y = lerp(world.y, app.screen.height / 2 - cy * s, t);
}

const pf = new PathFinder();
const chars = new Map<string, Character>();

function targetTile(a: AgentState): Tile {
  if (a.parentId) {
    const parent = chars.get(a.parentId);
    if (parent) return { col: parent.col + 1.2, row: parent.row + 0.6 }; // companion offset
  }
  return town.target(a);
}

async function routeTo(c: Character, t: Tile): Promise<void> {
  c.setPath(await pf.find({ col: c.col, row: c.row }, t));
}

function applySnapshot(snap: WorldSnapshot): void {
  const now = Date.now();
  town.sync(snap.agents, now);

  const seen = new Set<string>();
  for (const a of snap.agents) {
    seen.add(a.agentId);
    let c = chars.get(a.agentId);
    if (!c) {
      c = new Character(a.agentId, a.agentKind, a.displayName, targetTile(a), !!a.parentId);
      chars.set(a.agentId, c);
      entities.addChild(c.container);
    }
    c.setActivity(a.activity, a.detail);
    void routeTo(c, targetTile(a));
  }

  for (const [id, c] of chars) {
    if (!seen.has(id)) {
      entities.removeChild(c.container);
      c.destroy();
      chars.delete(id);
    }
  }

  renderLegend(snap.agents);
}

connect(HERMES_WS, applySnapshot);

app.ticker.add((tk) => {
  pf.pump();
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  town.update(dt, Date.now());
  for (const c of chars.values()) c.update(dt);
  fitCamera();
});
