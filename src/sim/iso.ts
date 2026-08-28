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

/** Southern ground contact point of an isometric footprint (anchor target). */
export function footprintSouthTipScreen(
  gx: number,
  gy: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const c = gridToScreen(gx + w - 1, gy + h - 1);
  return { x: c.x, y: c.y + TILE_H / 2 };
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

/** Shift world coords into positive picture space (avoids SkPicture clipping on west tiles). */
export function worldLayout(gridSize: number) {
  const bounds = worldContentBounds(gridSize);
  const pad = 16;
  const originX = -bounds.minX + pad;
  const originY = -bounds.minY + pad;
  return {
    originX,
    originY,
    worldW: bounds.maxX - bounds.minX + pad * 2,
    worldH: bounds.maxY - bounds.minY + pad * 2,
    minX: bounds.minX + originX,
    maxX: bounds.maxX + originX,
    minY: bounds.minY + originY,
    maxY: bounds.maxY + originY,
  };
}
