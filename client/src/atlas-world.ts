/** The computer's three public works, independent of repository villages. */
import type { SystemResourcesMessage } from "@aquarllm/shared";

type Resource = "cpu" | "memory" | "disk";
type Point = [number, number];
type Painter = {
  poly(ctx: CanvasRenderingContext2D, points: Point[], fill: string): void;
  line(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, width: number): void;
  ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void;
  shade(color: string, factor: number): string;
};

const META = {
  cpu: { name: "Windmill", label: "CPU", accent: "#e3be78", cell: { cx: -1, cy: 0 } },
  memory: { name: "Reservoir", label: "RAM", accent: "#7fd0cb", cell: { cx: 0, cy: -1 } },
  disk: { name: "Storehouse", label: "DISK", accent: "#d6a06c", cell: { cx: 1, cy: 1 } },
};

function percent(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
}

function gib(value: number): string {
  const n = value / 1024 ** 3;
  return `${n.toFixed(n >= 100 ? 0 : 1)} GiB`;
}

export class AtlasDistrict {
  readonly parcels = (Object.keys(META) as Resource[]).map((resource) => ({
    id: `atlas:${resource}`, name: META[resource].name, color: META[resource].accent,
    cell: META[resource].cell, resource, civic: true, agents: [], slots: [], slotUsed: [],
    life: 1, target: 1, removing: false, born: 0,
  }));
  private sample: SystemResourcesMessage | null = null;
  private receivedAt = 0;
  private connected = false;
  private awaitingReading = true;
  private millPhase = Math.PI / 8;
  private waterPhase = 0;
  private readonly now: () => number;
  private readonly reducedMotion: () => boolean;

  constructor(options: { now?: () => number; reducedMotion?: () => boolean } = {}) {
    this.now = options.now ?? (() => performance.now());
    const preference = options.reducedMotion ? null : window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = options.reducedMotion ?? (() => preference!.matches);
  }

  setResources(sample: SystemResourcesMessage): void {
    if (!this.sample || this.sample.sampledAt !== sample.sampledAt) this.receivedAt = this.now();
    this.sample = sample;
    this.awaitingReading = false;
  }

  setConnected(connected: boolean): void {
    if (connected && !this.connected) this.awaitingReading = true;
    this.connected = connected;
  }

  private freshness(): "live" | "waiting" | "offline" | "stale" {
    if (!this.connected) return this.sample ? "offline" : "waiting";
    if (!this.sample || this.awaitingReading) return "waiting";
    return this.now() - this.receivedAt > 8_000 ? "stale" : "live";
  }

  private value(resource: Resource): number | null {
    if (resource === "cpu") return percent(this.sample?.cpu.usagePercent);
    return percent(this.sample?.[resource]?.usagePercent);
  }

  private diskStale(): boolean {
    const disk = this.sample?.disk;
    return !!disk && !!this.sample && this.sample.sampledAt - disk.sampledAt + this.now() - this.receivedAt > 65_000;
  }

  update(dt: number, paused: boolean): void {
    if (paused || this.reducedMotion() || this.freshness() !== "live") return;
    const cpu = this.value("cpu");
    // Integrate speed; a new CPU reading must never jump the sails to another angle.
    if (cpu != null && cpu > 0) this.millPhase = (this.millPhase + dt * (0.12 + cpu * 0.035)) % (Math.PI * 2);
    if (this.value("memory") != null) this.waterPhase = (this.waterPhase + dt) % (Math.PI * 2);
  }

  hover(resource: Resource): { title: string; sub: string; accent: string } {
    const meta = META[resource], value = this.value(resource), sample = this.sample;
    let detail = "Waiting for a reading";
    if (resource === "cpu" && sample) detail = `${sample.cpu.cores} logical cores`;
    if (resource === "memory" && sample?.memory) detail = `${gib(sample.memory.usedBytes)} / ${gib(sample.memory.totalBytes)} · includes caches`;
    if (resource === "disk" && sample?.disk) detail = `${gib(sample.disk.usedBytes)} / ${gib(sample.disk.totalBytes)} · ${this.diskStale() ? "last check over 1m ago" : "space used"}`;
    const state = this.freshness();
    const status = state === "live" ? sample?.hostname || "server computer" : state === "offline" ? "disconnected · last reading" : state === "stale" ? "readings paused" : "waiting for Hermes";
    return { title: `${meta.name} · ${meta.label} ${value == null ? "—" : `${Math.round(value)}%`}`, sub: `${detail} · ${status}`, accent: meta.accent };
  }

  draw(ctx: CanvasRenderingContext2D, art: Painter, resource: Resource, x: number, y: number, z: number, ambient: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(z, z);
    const color = (hex: string, factor = 1) => art.shade(hex, ambient * factor);
    art.ell(ctx, 2, 9, 56, 16, "rgba(8,10,12,0.22)");
    // A stone apron roots each building in the same isometric land as the cottages.
    art.poly(ctx, [[0, -26], [66, 7], [0, 40], [-66, 7]], color("#bca47d", 0.91));
    art.line(ctx, [-56, 10], [0, 37], color("#dfc9a0"), 2);
    art.line(ctx, [0, 37], [57, 10], color("#8e795b"), 2);
    if (resource === "cpu") this.drawWindmill(ctx, art, color);
    else if (resource === "memory") this.drawReservoir(ctx, art, color);
    else this.drawStorehouse(ctx, art, color);
    ctx.restore();
  }

  drawLabel(ctx: CanvasRenderingContext2D, resource: Resource, x: number, y: number, z: number): void {
    const meta = META[resource], value = this.value(resource);
    const state = this.freshness(), stale = state !== "live" || (resource === "disk" && this.diskStale());
    const scale = Math.max(0.8, Math.min(1.05, z));
    ctx.save(); ctx.translate(x, y + 43 * z); ctx.scale(scale, scale);
    ctx.font = "700 10px 'JetBrains Mono',monospace";
    const label = `${meta.label} ${value == null ? "—" : `${Math.round(value)}%`}`;
    const caption = state === "offline" ? "disconnected" : state === "stale" ? "last reading" : state === "waiting" ? "waiting…" : resource === "disk" && stale ? "last reading" : meta.name.toLowerCase();
    const width = Math.max(88, ctx.measureText(caption).width + 24);
    ctx.fillStyle = "rgba(12,20,24,0.94)"; ctx.fillRect(-width / 2, 0, width, 31);
    ctx.fillStyle = stale ? "#7e8794" : meta.accent; ctx.fillRect(-width / 2, 0, width, 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f3e6c8"; ctx.fillText(label, 0, 12);
    ctx.font = "500 8px 'JetBrains Mono',monospace"; ctx.fillStyle = "#aab9b6"; ctx.fillText(caption, 0, 24);
    ctx.restore();
  }

  drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, z: number): void {
    const state = this.freshness();
    const status = state === "live" ? "the computer beneath the town" : state === "offline" ? "disconnected · keeping the last readings" : state === "stale" ? "readings paused" : "waiting for the first reading";
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.8, Math.min(1.05, z)), Math.max(0.8, Math.min(1.05, z)));
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "700 10px 'JetBrains Mono',monospace";
    const width = Math.max(218, ctx.measureText(status).width + 24);
    ctx.fillStyle = "rgba(12,20,24,0.92)"; ctx.fillRect(-width / 2, -18, width, 37);
    ctx.fillStyle = state === "live" ? "#7fd0cb" : "#7e8794"; ctx.fillRect(-width / 2, -18, width, 2);
    ctx.fillStyle = "#f3e6c8"; ctx.fillText("ATLAS · TOWN VITALS", 0, -4);
    ctx.font = "500 9px 'JetBrains Mono',monospace"; ctx.fillStyle = "#aab9b6"; ctx.fillText(status, 0, 10);
    ctx.restore();
  }

  private drawWindmill(ctx: CanvasRenderingContext2D, art: Painter, color: (hex: string, factor?: number) => string): void {
    // Timber-framed, tapered tower with a shingled cap and four canvas sails.
    art.poly(ctx, [[-23, 7], [6, 22], [4, -67], [-13, -73]], color("#ecdcbb"));
    art.poly(ctx, [[6, 22], [28, 11], [17, -73], [4, -67]], color("#d9b48a", 0.88));
    art.poly(ctx, [[-19, -70], [4, -59], [23, -69], [0, -94]], color("#b45e3f"));
    art.poly(ctx, [[4, -59], [23, -69], [0, -94]], color("#a24f35", 0.9));
    art.line(ctx, [-22, 3], [6, 17], color("#7a5232"), 4);
    art.line(ctx, [-19, -26], [5, -14], color("#7a5232"), 3);
    art.line(ctx, [-16, -51], [5, -41], color("#7a5232"), 3);
    art.line(ctx, [-15, -71], [-23, 7], color("#7a5232"), 3);
    art.line(ctx, [4, -64], [6, 20], color("#7a5232"), 3);
    art.poly(ctx, [[-8, 12], [0, 16], [0, -2], [-8, -6]], color("#664632"));
    ctx.fillStyle = color("#ffd98a"); ctx.fillRect(-7, -43, 6, 7);
    ctx.fillStyle = color("#76523a"); ctx.fillRect(-5, -43, 1, 7); ctx.fillRect(-7, -40, 6, 1);
    ctx.save(); ctx.translate(-6, -64); ctx.rotate(this.millPhase);
    for (let sail = 0; sail < 4; sail++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = color("#9b7549"); ctx.fillRect(-2, -53, 4, 55);
      ctx.fillStyle = color("#f3e6c8"); ctx.fillRect(2, -53, 11, 36);
      ctx.fillStyle = color("#d4bb8c"); ctx.fillRect(11, -53, 2, 36);
      ctx.fillStyle = color("#ac8b59");
      for (let rib = -48; rib < -17; rib += 8) ctx.fillRect(2, rib, 11, 2);
    }
    ctx.fillStyle = color("#6d4b34"); ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = color("#e3be78"); ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    // Grain sacks and flowers are decoration; only the sails encode the real CPU load.
    art.ell(ctx, 35, 12, 7, 4, color("#af8e55"));
    art.ell(ctx, 35, 8, 6, 7, color("#c9ad72"));
    art.line(ctx, [31, 3], [39, 3], color("#735336"), 2);
    ctx.fillStyle = color("#719a59"); ctx.fillRect(-37, 7, 3, 9);
    ctx.fillStyle = color("#e0a23c"); ctx.fillRect(-40, 5, 8, 4);
  }

  private drawReservoir(ctx: CanvasRenderingContext2D, art: Painter, color: (hex: string, factor?: number) => string): void {
    const fill = this.value("memory");
    const top = 10 - (fill ?? 0) * 0.52;
    // Stone sides enclose a cutaway front, so the actual waterline remains legible.
    art.poly(ctx, [[-43, -52], [11, -65], [49, -44], [-6, -30]], color("#8da19c"));
    art.poly(ctx, [[11, -57], [42, -40], [42, 12], [11, -4]], color("#425f65"));
    ctx.fillStyle = color("#28464f"); ctx.fillRect(-37, -44, 53, 58);
    art.poly(ctx, [[16, -44], [42, -40], [42, 12], [16, 14]], color("#33545a"));
    if (fill != null && fill > 0) {
      ctx.fillStyle = color("#5fb0ab"); ctx.fillRect(-35, top, 50, 14 - top);
      art.poly(ctx, [[15, top], [39, top - 4], [39, 11], [15, 14]], color("#448e92"));
      art.poly(ctx, [[-35, top], [-11, top - 12], [39, top - 4], [15, top]], color("#84d3c7"));
      const ripple = Math.sin(this.waterPhase * 1.7) * 3;
      art.line(ctx, [-27 + ripple, top - 1], [-10 + ripple, top - 1], color("#c5eee0"), 2);
      art.line(ctx, [4 - ripple, top - 5], [19 - ripple, top - 5], color("#b3e4d7"), 2);
    }
    ctx.fillStyle = color("#9fada4"); ctx.fillRect(-44, -53, 8, 69); ctx.fillRect(16, -46, 8, 68);
    art.poly(ctx, [[24, -46], [49, -44], [49, 14], [24, 22]], color("#6f8582"));
    art.poly(ctx, [[-44, 12], [20, 15], [49, 7], [49, 17], [20, 27], [-44, 22]], color("#9fada4"));
    art.poly(ctx, [[-44, 12], [20, 15], [49, 7], [42, 4], [19, 10], [-36, 7]], color("#bbc3b3"));
    ctx.fillStyle = color("#c0c8b9"); ctx.fillRect(-46, -55, 12, 6); ctx.fillRect(14, -49, 12, 6);
    ctx.fillStyle = color("#556b6b");
    for (let row = -35; row < 10; row += 13) { ctx.fillRect(-44, row, 8, 2); ctx.fillRect(16, row + 4, 8, 2); }
    // The depth ruler makes the water's changing height easy to read at a glance.
    ctx.fillStyle = color("#e5d6ad"); ctx.fillRect(-30, -42, 3, 52);
    for (let y = -42; y <= 10; y += 13) ctx.fillRect(-30, y, 9, 2);
    art.line(ctx, [40, -16], [57, -8], color("#b5aa85"), 6);
    art.line(ctx, [57, -8], [57, 5], color("#b5aa85"), 6);
    ctx.fillStyle = color("#6e8350"); ctx.fillRect(-51, 13, 3, 9); ctx.fillRect(-55, 17, 3, 7);
  }

  private drawStorehouse(ctx: CanvasRenderingContext2D, art: Painter, color: (hex: string, factor?: number) => string): void {
    art.poly(ctx, [[-43, -48], [18, -46], [18, 24], [-43, 9]], color("#d5b78c"));
    art.poly(ctx, [[18, -46], [49, -61], [49, 8], [18, 24]], color("#b68d62", 0.9));
    art.poly(ctx, [[-51, -49], [-15, -82], [20, -46]], color("#c2683f"));
    art.poly(ctx, [[-15, -82], [16, -97], [55, -63], [20, -46]], color("#a8542f"));
    art.line(ctx, [-15, -82], [16, -97], color("#e09b66"), 3);
    for (let shingle = 0; shingle < 4; shingle++) {
      art.line(ctx, [-8 + shingle * 7, -75 + shingle * 7], [23 + shingle * 7, -90 + shingle * 7], color("#82472f"), 2);
    }
    art.poly(ctx, [[-35, -40], [11, -30], [11, 20], [-35, 9]], color("#4f3b2f"));
    art.line(ctx, [-43, -48], [-43, 9], color("#765037"), 4);
    art.line(ctx, [18, -46], [18, 24], color("#765037"), 4);
    art.line(ctx, [-43, -48], [18, -34], color("#765037"), 4);
    art.line(ctx, [-43, 9], [18, 24], color("#765037"), 4);
    // Twelve cubbies fill from the bottom. Dim empty shelves remain visibly empty.
    const fill = this.value("disk"), crates = fill == null ? 0 : Math.ceil(fill * 12 / 100);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -33 + col * 11, y = 5 - row * 14 + col * 2.5;
        if (row * 4 + col < crates) this.crate(ctx, art, color, x, y);
        else { ctx.fillStyle = color("#776046", 0.8); ctx.fillRect(x, y - 1, 10, 2); }
      }
      art.line(ctx, [-35, 9 - row * 14], [11, 20 - row * 14], color("#ac8759"), 2);
    }
    art.poly(ctx, [[29, -35], [40, -40], [40, -24], [29, -19]], color("#ffd98a"));
    art.line(ctx, [34, -37], [34, -21], color("#72513a"), 2);
    art.line(ctx, [29, -27], [40, -32], color("#72513a"), 2);
    ctx.fillStyle = color("#d4ae76"); ctx.fillRect(-49, 11, 4, 10); ctx.fillRect(14, 26, 4, 10);
    art.poly(ctx, [[-49, 11], [17, 27], [7, 32], [-59, 16]], color("#be9865"));
  }

  private crate(ctx: CanvasRenderingContext2D, art: Painter, color: (hex: string, factor?: number) => string, x: number, y: number): void {
    ctx.fillStyle = color("#c49555"); ctx.fillRect(x, y - 11, 9, 11);
    ctx.fillStyle = color("#e0bb7b"); ctx.fillRect(x, y - 11, 9, 2); ctx.fillRect(x, y - 11, 2, 11);
    art.line(ctx, [x + 2, y - 8], [x + 7, y - 2], color("#7f603c"), 2);
  }
}
