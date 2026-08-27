/**
 * Sprite registry for pre-rendered PNGs.
 * Placeholder mode returns null → renderer draws colored blocks.
 * Add require() entries when art is ready, e.g.:
 *   'building_qg_1': require('../../assets/buildings/qg_lvl1.png'),
 */
export type SpriteKey = string;

const SPRITES: Record<string, number | null> = {
  // buildings — populate when PNGs exist
  // 'building_qg_1': require('../../assets/buildings/qg_lvl1.png'),
  // troops
  // 'troop_falegname': require('../../assets/troops/falegname.png'),
};

export function resolveBuildingSprite(spriteKey: string, level: number): number | null {
  return SPRITES[`${spriteKey}_${level}`] ?? SPRITES[spriteKey] ?? null;
}

export function resolveTroopSprite(spriteKey: string): number | null {
  return SPRITES[spriteKey] ?? null;
}

export function listRegisteredSprites(): string[] {
  return Object.keys(SPRITES);
}
