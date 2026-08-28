import { TILE_W, TILE_H } from '../sim/iso';

export function worldDimensions(gridSize: number) {
  return {
    worldW: gridSize * TILE_W + 80,
    worldH: gridSize * TILE_H + 120,
  };
}
