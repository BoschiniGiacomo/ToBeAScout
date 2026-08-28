/**
 * Sprite registry for pre-rendered PNGs.
 * Placeholder mode returns null → renderer draws colored blocks.
 */
export type SpriteKey = string;

const SPRITES: Record<string, number> = {
  // grass_empty.png on disk only — ground uses lightweight Views (Expo Go OOM)
  building_qg: require('../../assets/buildings/qg_lvl1.png'),
  building_qg_1: require('../../assets/buildings/qg_lvl1.png'),
  building_qg_2: require('../../assets/buildings/qg_lvl1.png'),
  building_qg_3: require('../../assets/buildings/qg_lvl1.png'),
  building_qg_4: require('../../assets/buildings/qg_lvl1.png'),
  building_qg_5: require('../../assets/buildings/qg_lvl1.png'),
  building_pozzo: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_1: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_2: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_3: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_4: require('../../assets/buildings/pozzo_lvl1.png'),
  building_pozzo_5: require('../../assets/buildings/pozzo_lvl1.png'),
  building_deposito_legna: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_deposito_legna_1: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_deposito_legna_2: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_deposito_legna_3: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_deposito_legna_4: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_deposito_legna_5: require('../../assets/buildings/deposito_legna_lvl1.png'),
  building_tenda_squadriglia: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_squadriglia_1: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_squadriglia_2: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_squadriglia_3: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_squadriglia_4: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_squadriglia_5: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  building_tenda_specialita: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_tenda_specialita_1: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_tenda_specialita_2: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_tenda_specialita_3: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_tenda_specialita_4: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_tenda_specialita_5: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  building_sopraelevata: require('../../assets/buildings/sopraelevata_lvl1.png'),
  building_sopraelevata_1: require('../../assets/buildings/sopraelevata_lvl1.png'),
  building_sopraelevata_2: require('../../assets/buildings/sopraelevata_lvl1.png'),
  building_sopraelevata_3: require('../../assets/buildings/sopraelevata_lvl1.png'),
  troop_maestro_giochi: require('../../assets/troops/maestro_giochi.png'),
  troop_falegname: require('../../assets/troops/falegname_lvl1.png'),
  troop_falegname_1: require('../../assets/troops/falegname_lvl1.png'),
  troop_falegname_2: require('../../assets/troops/falegname_lvl2.png'),
};

export function resolveTileSprite(_id: string = 'tile_grass_empty'): number | null {
  return null;
}

export function resolveBuildingSprite(spriteKey: string, level: number): number | null {
  return SPRITES[`${spriteKey}_${level}`] ?? SPRITES[spriteKey] ?? null;
}

export function resolveTroopSprite(spriteKey: string, level = 1): number | null {
  return SPRITES[`${spriteKey}_${level}`] ?? SPRITES[spriteKey] ?? null;
}

export function listRegisteredSprites(): string[] {
  return Object.keys(SPRITES);
}
