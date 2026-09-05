/** Agora — boots the Living City, feeds it the live Hermes data + activity feed. */
import type { WorldSnapshot } from "@aquarllm/shared";
import { LivingCity } from "./city.ts";
import { ActivityLog, renderLegend } from "./activitylog.ts";
import { connect } from "./net.ts";
import { AtlasPanel } from "./atlas.ts";

// Dev (Vite :5173) talks to Hermes on :8787; the packaged app serves the city from the
// same origin as its server, so derive the WS URL from the page location there.
const HERMES_WS =
  (import.meta.env.VITE_HERMES_WS as string | undefined) ??
  (location.port === "5173"
    ? "ws://localhost:8787/ws"
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);

const canvas = document.getElementById("town") as HTMLCanvasElement;
const city = new LivingCity(canvas);

// Visibility is a viewer preference; the live readings and sidebar remain available.
const ISLAND_PREFERENCE = "aquarllm.resource-island";
let resourceIslandVisible = true;
try { resourceIslandVisible = localStorage.getItem(ISLAND_PREFERENCE) !== "false"; } catch { /* storage may be disabled */ }
const islandToggle = document.getElementById("atlas-island-toggle") as HTMLButtonElement;
function setResourceIsland(visible: boolean): void {
  resourceIslandVisible = visible;
  city.setResourceIslandVisible(visible);
  islandToggle.classList.toggle("on", visible);
  islandToggle.setAttribute("aria-pressed", String(visible));
  islandToggle.title = visible ? "Hide resource island" : "Show resource island";
}
islandToggle.addEventListener("click", () => {
  setResourceIsland(!resourceIslandVisible);
  try { localStorage.setItem(ISLAND_PREFERENCE, String(resourceIslandVisible)); } catch { /* retain this session's choice */ }
});
setResourceIsland(resourceIslandVisible);
city.start();

const atlasElement = document.getElementById("atlas")!;
const atlas = new AtlasPanel(atlasElement);
// Reserve the panel's actual height, including when its details are collapsed.
new ResizeObserver(() => {
  city.setResourcePanelHeight(atlasElement.getBoundingClientRect().height + 8);
}).observe(atlasElement);

// Activity feed + legend (left panel)
const log = new ActivityLog(document.getElementById("lg-list")!);
renderLegend(
  document.getElementById("lg-acts")!,
  document.getElementById("lg-factions")!,
  document.getElementById("lg-res")!,
);

connect(HERMES_WS, {
  snapshot: (snap: WorldSnapshot) => city.syncAgents(snap.agents),
  log: (entries) => log.add(entries),
  repos: (repos) => city.setRepos(repos),
  resources: (resources) => { atlas.update(resources); city.setSystemResources(resources); },
  connection: (connected) => { atlas.setConnected(connected); city.setResourcesConnected(connected); },
});

// Show/hide the left panel; reserve gutter so the city re-centres between the panels.
const panel = document.getElementById("log")!;
const showBtn = document.getElementById("lg-show")!;
const GUTTER = 314;
let logOpen = window.innerWidth >= 1000;
let logChosen = false;
function setLog(open: boolean, chosen = false): void {
  if (chosen) logChosen = true;
  logOpen = open;
  panel.hidden = !open;
  showBtn.hidden = open;
  city.setLeftGutter(open ? GUTTER : 0);
}
document.getElementById("lg-hide")!.addEventListener("click", () => setLog(false, true));
showBtn.addEventListener("click", () => setLog(true, true));
window.addEventListener("keydown", (e) => {
  if ((e.key === "l" || e.key === "L") && !e.metaKey && !e.ctrlKey) setLog(!logOpen, true);
});
window.addEventListener("resize", () => { if (!logChosen) setLog(window.innerWidth >= 1000); });
setLog(logOpen);

// World switcher
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-world]")];
function refresh(): void {
  for (const b of buttons) b.classList.toggle("on", b.dataset.world === city.worldKey);
}
for (const b of buttons) {
  b.addEventListener("click", () => {
    city.setWorld(b.dataset.world!);
    refresh();
  });
}
refresh();

// Time-of-day switcher (Cozy Houses) — re-lights the cozy worlds (Harbor / Isles).
const todButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-tod]")];
function refreshTod(): void {
  for (const b of todButtons) b.classList.toggle("on", b.dataset.tod === city.timeOfDay);
}
for (const b of todButtons) {
  b.addEventListener("click", () => {
    city.setTimeOfDay(b.dataset.tod!);
    refreshTod();
  });
}
refreshTod();
