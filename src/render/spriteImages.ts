/**
 * Central sprite atlas loader — one useImage per unique PNG (CoC-style).
 * Never call useImage inside per-building components (causes Expo Go OOM/leaks).
 */
import { useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

export const SPRITE_SOURCES = {
  qg: require('../../assets/buildings/qg_lvl1.png'),
  pozzo: require('../../assets/buildings/pozzo_lvl1.png'),
  deposito: require('../../assets/buildings/deposito_legna_lvl1.png'),
  tendaSq: require('../../assets/buildings/tenda_squadriglia_lvl1.png'),
  tendaSp: require('../../assets/buildings/tenda_specialita_lvl1.png'),
  sopraelevata: require('../../assets/buildings/sopraelevata_lvl1.png'),
} as const;

export type SpriteSourceId = (typeof SPRITE_SOURCES)[keyof typeof SPRITE_SOURCES];

/** All unique building PNG modules → decoded Skia image (loaded once). */
export function useSpriteImageMap(): ReadonlyMap<number, ReturnType<typeof useImage>> {
  const qg = useImage(SPRITE_SOURCES.qg);
  const pozzo = useImage(SPRITE_SOURCES.pozzo);
  const deposito = useImage(SPRITE_SOURCES.deposito);
  const tendaSq = useImage(SPRITE_SOURCES.tendaSq);
  const tendaSp = useImage(SPRITE_SOURCES.tendaSp);
  const sopraelevata = useImage(SPRITE_SOURCES.sopraelevata);

  return useMemo(() => {
    const m = new Map<number, ReturnType<typeof useImage>>();
    m.set(SPRITE_SOURCES.qg, qg);
    m.set(SPRITE_SOURCES.pozzo, pozzo);
    m.set(SPRITE_SOURCES.deposito, deposito);
    m.set(SPRITE_SOURCES.tendaSq, tendaSq);
    m.set(SPRITE_SOURCES.tendaSp, tendaSp);
    m.set(SPRITE_SOURCES.sopraelevata, sopraelevata);
    return m;
  }, [qg, pozzo, deposito, tendaSq, tendaSp, sopraelevata]);
}
