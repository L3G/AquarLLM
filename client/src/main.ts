/** Agora — boots the Living City, feeds it the live Hermes data + activity feed. */
import type { WorldSnapshot } from "@aquarllm/shared";
import { LivingCity } from "./city.ts";
import { ActivityLog, renderLegend } from "./activitylog.ts";
import { connect } from "./net.ts";

const HERMES_WS =
  (import.meta.env.VITE_HERMES_WS as string | undefined) ?? "ws://localhost:8787/ws";

const canvas = document.getElementById("town") as HTMLCanvasElement;
const city = new LivingCity(canvas);
city.start();

// Activity feed + legend (left panel)
const log = new ActivityLog(document.getElementById("lg-list")!);
renderLegend(document.getElementById("lg-acts")!, document.getElementById("lg-factions")!);

connect(HERMES_WS, {
  snapshot: (snap: WorldSnapshot) => city.syncAgents(snap.agents),
  log: (entries) => log.add(entries),
});

// Show/hide the left panel; reserve gutter so the city re-centres between the panels.
const panel = document.getElementById("log")!;
const showBtn = document.getElementById("lg-show")!;
const GUTTER = 314;
let logOpen = true;
function setLog(open: boolean): void {
  logOpen = open;
  panel.hidden = !open;
  showBtn.hidden = open;
  city.setLeftGutter(open ? GUTTER : 0);
}
document.getElementById("lg-hide")!.addEventListener("click", () => setLog(false));
showBtn.addEventListener("click", () => setLog(true));
window.addEventListener("keydown", (e) => {
  if ((e.key === "l" || e.key === "L") && !e.metaKey && !e.ctrlKey) setLog(!logOpen);
});
setLog(true);

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
