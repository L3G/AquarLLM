// easystarjs ships no types; we only need a tiny surface.
declare module "easystarjs" {
  interface EasyStarInstance {
    setGrid(grid: number[][]): void;
    setAcceptableTiles(tiles: number[]): void;
    enableDiagonals(): void;
    disableCornerCutting(): void;
    findPath(
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      cb: (path: { x: number; y: number }[] | null) => void,
    ): number;
    calculate(): void;
  }
  const EasyStar: { js: new () => EasyStarInstance };
  export default EasyStar;
}
