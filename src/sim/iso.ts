import { META } from './content';

export const TILE_W = META.tileWidth;
export const TILE_H = META.tileHeight;

export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToGrid(sx: number, sy: number): { x: number; y: number } {
  const gx = sx / (TILE_W / 2) + sy / (TILE_H / 2);
  const gy = sy / (TILE_H / 2) - sx / (TILE_W / 2);
  return { x: Math.floor(gx / 2), y: Math.floor(gy / 2) };
}

export function footprintCenterScreen(
  gx: number,
  gy: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return gridToScreen(gx + (w - 1) / 2, gy + (h - 1) / 2);
}

export function depthKey(gx: number, gy: number, w: number, h: number, layer = 0): number {
  return (gx + w + gy + h) * 10 + layer;
}

export function tilesOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Screen-space AABB of the isometric grid (includes negative x for west tiles). */
export function worldContentBounds(gridSize: number) {
  const tl = gridToScreen(0, 0);
  const tr = gridToScreen(gridSize - 1, 0);
  const bl = gridToScreen(0, gridSize - 1);
  const br = gridToScreen(gridSize - 1, gridSize - 1);
  return {
    minX: Math.min(tl.x, tr.x, bl.x, br.x) - TILE_W / 2,
    maxX: Math.max(tl.x, tr.x, bl.x, br.x) + TILE_W / 2,
    minY: Math.min(tl.y, tr.y, bl.y, br.y) - TILE_H / 2,
    maxY: Math.max(tl.y, tr.y, bl.y, br.y) + TILE_H,
  };
}
