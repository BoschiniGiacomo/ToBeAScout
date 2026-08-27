/**
 * Sprite registry for pre-rendered PNGs.
 * Placeholder mode returns null → renderer draws colored blocks.
 */
export type SpriteKey = string;

const SPRITES: Record<string, number> = {
  building_pozzo: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_1: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_2: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_3: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_4: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_5: require('../../assets/buildings/pozzo_lvl1.png'),
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
