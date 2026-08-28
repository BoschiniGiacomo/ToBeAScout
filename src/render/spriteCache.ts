import { Image } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { listUniqueSpriteSources } from './assets';

const cache = new Map<number, SkImage | null>();
let preloadPromise: Promise<void> | null = null;

/** Load each PNG once into Skia (atlas-style cache, no per-frame useImage). */
export async function preloadSpriteSources(sources: number[]): Promise<void> {
  await Promise.all(
    sources.map(async (source) => {
      if (cache.has(source)) return;
      try {
        const resolved = Image.resolveAssetSource(source);
        if (!resolved?.uri) {
          cache.set(source, null);
          return;
        }
        const data = await Skia.Data.fromURI(resolved.uri);
        const img = Skia.Image.MakeImageFromEncoded(data);
        cache.set(source, img);
      } catch {
        cache.set(source, null);
      }
    }),
  );
}

export function preloadAllSprites(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = preloadSpriteSources(listUniqueSpriteSources());
  }
  return preloadPromise;
}

export function getSkiaImage(source: number): SkImage | null {
  return cache.get(source) ?? null;
}

export function spritesAreReady(): boolean {
  return cache.size > 0;
}

export function clearSpriteCache(): void {
  for (const img of cache.values()) {
    img?.dispose?.();
  }
  cache.clear();
  preloadPromise = null;
}
