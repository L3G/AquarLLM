/**
 * The Town — a living map of what's being worked on.
 *
 * Each distinct project (folder) gets its own plot, allocated on a spiral of cells
 * that grows outward from the centre. A plot appears when the first agent starts
 * working in that project and fades out a few seconds after the last one leaves, so
 * the town literally grows and shrinks with activity. Within a plot, agents stand at
 * an activity-specific spot, so you can read both *what project* and *what they're
 * doing* at a glance.
 */
import { Container, Graphics, Text } from "pixi.js";
import type { Activity, AgentState } from "@aquarllm/shared";
import { GRID, TILE_H, TILE_W, isoToScreen, type Tile } from "./iso.ts";

const PLOT = 8; // plot is PLOT×PLOT tiles
const STRIDE = 10; // distance between plot centres (plot + gap)
const CENTER = Math.floor(GRID / 2);
const GRACE_MS = 8000; // keep an empty plot this long before removing it

/** Activity → offset from the plot centre (a loose 3×3 of work spots). */
const ACT_OFFSET: Record<Activity, Tile> = {
  reading: { col: -2.2, row: -2.2 },
  editing: { col: 0, row: -2.4 },
  running: { col: 2.2, row: -2.2 },
  searching: { col: -2.4, row: 0 },
  thinking: { col: 0, row: 0 },
  waiting: { col: 2.4, row: 0 },
  spawning: { col: -2.2, row: 2.2 },
  error: { col: 0, row: 2.4 },
  idle: { col: 2.2, row: 2.2 },
  joined: { col: 0, row: 3 },
  left: { col: 0, row: 3 },
};

/** Square-spiral cell offsets (in cell units), outward from the centre. */
function spiralCells(n: number): Array<{ dx: number; dy: number }> {
  const cells = [{ dx: 0, dy: 0 }];
  let x = 0;
  let y = 0;
  let step = 1;
  while (cells.length < n) {
    for (let i = 0; i < step && cells.length < n; i++) cells.push({ dx: ++x, dy: y });
    for (let i = 0; i < step && cells.length < n; i++) cells.push({ dx: x, dy: ++y });
    step++;
    for (let i = 0; i < step && cells.length < n; i++) cells.push({ dx: --x, dy: y });
    for (let i = 0; i < step && cells.length < n; i++) cells.push({ dx: x, dy: --y });
    step++;
  }
  return cells;
}
const SPIRAL = spiralCells(49);

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function projectColor(name: string): number {
  return hslToHex(hashHue(name), 0.42, 0.34);
}

interface Plot {
  project: string;
  cell: number;
  center: Tile;
  container: Container;
  label: Text;
  color: number;
  count: number;
  emptySince: number | null;
  alpha: number;
}

export class Town {
  readonly layer = new Container();
  private plots = new Map<string, Plot>();
  private usedCells = new Set<number>();

  /** Reconcile plots against the current agent set. */
  sync(agents: AgentState[], now: number): void {
    const counts = new Map<string, number>();
    for (const a of agents) {
      const key = a.project || "·";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const [project, count] of counts) {
      let p = this.plots.get(project);
      if (!p) p = this.addPlot(project);
      p.count = count;
      p.emptySince = null;
      p.label.text = `${project} ·${count}`;
    }

    for (const [project, p] of this.plots) {
      if (!counts.has(project) && p.emptySince === null) p.emptySince = now;
    }
  }

  /** Target tile for an agent: its project plot, offset by activity. */
  target(agent: AgentState): Tile {
    const p = this.plots.get(agent.project || "·");
    const c = p ? p.center : { col: CENTER, row: CENTER };
    const off = ACT_OFFSET[agent.activity] ?? { col: 0, row: 0 };
    return { col: c.col + off.col, row: c.row + off.row };
  }

  /** Fade plots in/out; remove ones whose grace period elapsed. */
  update(dt: number, now: number): void {
    for (const [project, p] of this.plots) {
      const goal = p.emptySince !== null && now - p.emptySince > GRACE_MS ? 0 : 1;
      p.alpha += (goal - p.alpha) * Math.min(1, dt * 4);
      p.container.alpha = p.alpha;
      if (goal === 0 && p.alpha < 0.02) this.removePlot(project);
    }
  }

  /** Screen-space bounding box of visible plots (for camera fit). */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.plots.values()) {
      if (p.alpha < 0.08) continue;
      const h = PLOT / 2 + 1;
      for (const [c, r] of [
        [p.center.col - h, p.center.row - h],
        [p.center.col + h, p.center.row - h],
        [p.center.col - h, p.center.row + h],
        [p.center.col + h, p.center.row + h],
      ]) {
        const { x, y } = isoToScreen(c!, r!);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (minX === Infinity) return null;
    return { minX, minY: minY - 28, maxX, maxY }; // headroom for the signpost label
  }

  private firstFreeCell(): number {
    for (let i = 0; i < SPIRAL.length; i++) if (!this.usedCells.has(i)) return i;
    return SPIRAL.length - 1;
  }

  private addPlot(project: string): Plot {
    const cell = this.firstFreeCell();
    this.usedCells.add(cell);
    const { dx, dy } = SPIRAL[cell]!;
    const center: Tile = { col: CENTER + dx * STRIDE, row: CENTER + dy * STRIDE };
    const color = projectColor(project);

    const container = new Container();
    const half = PLOT / 2;
    for (let r = -half; r < half; r++) {
      for (let c = -half; c < half; c++) {
        const edge = c === -half || c === half - 1 || r === -half || r === half - 1;
        const { x, y } = isoToScreen(center.col + c, center.row + r);
        const g = new Graphics();
        g.poly([0, -TILE_H / 2, TILE_W / 2, 0, 0, TILE_H / 2, -TILE_W / 2, 0])
          .fill({ color, alpha: edge ? 0.95 : 0.78 })
          .stroke({ width: 1, color: 0x000000, alpha: 0.18 });
        g.position.set(x, y);
        container.addChild(g);
      }
    }

    const top = isoToScreen(center.col - half, center.row - half);
    const label = new Text({
      text: project,
      style: {
        fontFamily: "monospace",
        fontSize: 13,
        fontWeight: "bold",
        fill: 0xf0f4fa,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(isoToScreen(center.col, center.row).x, top.y - 2);
    container.addChild(label);

    container.alpha = 0;
    const plot: Plot = { project, cell, center, container, label, color, count: 0, emptySince: null, alpha: 0 };
    this.plots.set(project, plot);
    this.layer.addChild(container);
    return plot;
  }

  private removePlot(project: string): void {
    const p = this.plots.get(project);
    if (!p) return;
    this.layer.removeChild(p.container);
    p.container.destroy({ children: true });
    this.usedCells.delete(p.cell);
    this.plots.delete(project);
  }
}
