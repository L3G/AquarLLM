/** Isometric grid math. Tiles are 2:1 diamonds. */
export const TILE_W = 64;
export const TILE_H = 32;
export const GRID = 50; // square grid, cols & rows 0..GRID-1 (room for many project plots)

export interface Tile {
  col: number;
  row: number;
}

/** Logical tile (col,row) → screen offset within the world container. */
export function isoToScreen(col: number, row: number): { x: number; y: number } {
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

/** Screen offset → logical tile (floats). Inverse of isoToScreen. */
export function screenToIso(x: number, y: number): Tile {
  const a = x / (TILE_W / 2);
  const b = y / (TILE_H / 2);
  return { col: (a + b) / 2, row: (b - a) / 2 };
}

/** Painter's-order depth: tiles/entities further "down-right" draw on top. */
export function depth(col: number, row: number): number {
  return col + row;
}
