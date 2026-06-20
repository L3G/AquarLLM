/** Agora — boots the Living City canvas renderer and feeds it the live Hermes data. */
import type { WorldSnapshot } from "@aquarllm/shared";
import { LivingCity } from "./city.ts";
import { connect } from "./net.ts";

const HERMES_WS =
  (import.meta.env.VITE_HERMES_WS as string | undefined) ?? "ws://localhost:8787/ws";

const canvas = document.getElementById("town") as HTMLCanvasElement;
const city = new LivingCity(canvas);
city.start();

connect(HERMES_WS, (snap: WorldSnapshot) => city.syncAgents(snap.agents));

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
