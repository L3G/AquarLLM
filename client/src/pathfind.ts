/** Thin wrapper over easystar.js for A* on the (fully walkable) town grid. */
import EasyStar from "easystarjs";
import { GRID, type Tile } from "./iso.ts";

export class PathFinder {
  private es = new EasyStar.js();

  constructor() {
    const grid: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(0));
    this.es.setGrid(grid);
    this.es.setAcceptableTiles([0]);
    this.es.enableDiagonals();
    this.es.disableCornerCutting();
  }

  /** Must be called every frame to advance queued path calculations. */
  pump(): void {
    this.es.calculate();
  }

  /** Resolve a tile path from `from` to `to` (inclusive of endpoints). */
  find(from: Tile, to: Tile): Promise<Tile[]> {
    const fx = clamp(Math.round(from.col));
    const fy = clamp(Math.round(from.row));
    const tx = clamp(Math.round(to.col));
    const ty = clamp(Math.round(to.row));
    return new Promise((resolve) => {
      if (fx === tx && fy === ty) {
        resolve([{ col: tx, row: ty }]);
        return;
      }
      this.es.findPath(fx, fy, tx, ty, (path) => {
        if (!path || path.length === 0) {
          resolve([{ col: tx, row: ty }]);
          return;
        }
        resolve(path.map((p) => ({ col: p.x, row: p.y })));
      });
    });
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(GRID - 1, n));
}
