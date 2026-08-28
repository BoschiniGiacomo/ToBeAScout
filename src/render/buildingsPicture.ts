import { Skia, type SkPicture } from '@shopify/react-native-skia';
import { TILE_H, TILE_W, footprintSouthTipScreen } from '../sim/iso';
import { getSkiaImage } from './spriteCache';

export type PictureDrawItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  sprite: number | null;
  anchorX: number;
  anchorY: number;
};

/** Fine-tune anchor on footprint south tip (+ = forward, − = back). */
const DEPTH_NUDGE_Y = 3;

/** Layout rect for a building draw item (shared by picture + live ghost). */
export function layoutDrawItem(item: PictureDrawItem) {
  return layoutSprite(item);
}

function layoutSprite(item: PictureDrawItem) {
  const tip = footprintSouthTipScreen(item.x, item.y, item.w, item.h);
  const footprintW = (item.w + item.h) * (TILE_W / 2);
  let bw = Math.max(TILE_W * 0.8, footprintW);
  let bh: number;

  if (item.sprite) {
    const img = getSkiaImage(item.sprite);
    if (img && img.width() > 0) {
      bh = bw * (img.height() / img.width());
    } else {
      bh = Math.max(TILE_H * 1.8, bw * 0.9);
    }
  } else {
    bw = Math.max(36, footprintW * 0.85);
    bh = Math.max(TILE_H, item.h * TILE_H * 0.9);
  }

  const ax = item.anchorX;
  const ay = item.anchorY;
  return {
    left: tip.x - bw * ax,
    top: tip.y - bh * ay + DEPTH_NUDGE_Y,
    bw,
    bh,
  };
}

/** Buildings only — rebuilt when layout/sprites change, terrain stays cached. */
export function recordBuildingsPicture(
  worldW: number,
  worldH: number,
  originX: number,
  originY: number,
  items: PictureDrawItem[],
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, worldW, worldH));
  canvas.translate(originX, originY);
  const fillPaint = Skia.Paint();
  const imgPaint = Skia.Paint();

  for (const item of items) {
    const { left, top, bw, bh } = layoutSprite(item);
    if (item.sprite) {
      const img = getSkiaImage(item.sprite);
      if (img) {
        const src = Skia.XYWHRect(0, 0, img.width(), img.height());
        const dst = Skia.XYWHRect(left, top, bw, bh);
        canvas.drawImageRect(img, src, dst, imgPaint);
        continue;
      }
    }
    fillPaint.setColor(Skia.Color(item.color));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(left, top, bw, bh), 4, 4), fillPaint);
  }

  return recorder.finishRecordingAsPicture();
}

let cachedKey = '';
let cachedPicture: SkPicture | null = null;

/** Cached buildings layer — avoids dispose/recreate flicker on unchanged layout. */
export function getBuildingsPicture(
  key: string,
  worldW: number,
  worldH: number,
  originX: number,
  originY: number,
  items: PictureDrawItem[],
): SkPicture {
  if (key === cachedKey && cachedPicture) return cachedPicture;
  const prev = cachedPicture;
  cachedPicture = recordBuildingsPicture(worldW, worldH, originX, originY, items);
  cachedKey = key;
  prev?.dispose?.();
  return cachedPicture;
}

export function clearBuildingsPictureCache(): void {
  cachedPicture?.dispose?.();
  cachedPicture = null;
  cachedKey = '';
}
