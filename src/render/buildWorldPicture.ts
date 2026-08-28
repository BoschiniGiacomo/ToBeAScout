import { worldLayout } from '../sim/iso';

/** @deprecated use worldLayout */
export function worldDimensions(gridSize: number) {
  const layout = worldLayout(gridSize);
  return { worldW: layout.worldW, worldH: layout.worldH };
}

export { worldLayout };
