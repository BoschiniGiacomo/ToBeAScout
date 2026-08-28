import { Skia, type SkPicture } from '@shopify/react-native-skia';
import { footprintGroundBounds } from '../sim/iso';
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

/** Bottom fraction of PNG where grass/base pad lives (128×128 building exports). */
const GROUND_PAD_FRACTION = 0.34;
/** Slight horizontal bleed so tile edges stay covered. */
const WIDTH_COVER = 1.04;
/** Fine-tune after ground-box anchor (+ = forward). */
const DEPTH_NUDGE_Y = 2;

function layoutSprite(item: PictureDrawItem) {
  const ground = footprintGroundBounds(item.x, item.y, item.w, item.h);
  const ax = item.anchorX;
  const ay = item.anchorY;

  if (item.sprite) {
    const img = getSkiaImage(item.sprite);
    const bw = ground.width * WIDTH_COVER;
    if (img && img.width() > 0) {
      const aspect = img.height() / img.width();
      const padH = Math.max(ground.height, ground.width * 0.22);
      const bhFromPad = padH / GROUND_PAD_FRACTION;
      const bhFromAspect = bw * aspect;
      const bh = Math.max(bhFromPad, bhFromAspect * 0.92);
      return {
        left: ground.centerX - bw * ax,
        top: ground.southY - bh * ay + DEPTH_NUDGE_Y,
        bw,
        bh,
      };
    }
  }

  const bw = Math.max(36, ground.width * 0.9);
  const bh = Math.max(24, ground.height * 1.1);
  return {
    left: ground.centerX - bw * ax,
    top: ground.southY - bh * ay + DEPTH_NUDGE_Y,
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
const LAYOUT_REV = 'ground-box-v1';

/** Cached buildings layer — avoids dispose/recreate flicker on unchanged layout. */
export function getBuildingsPicture(
  key: string,
  worldW: number,
  worldH: number,
  originX: number,
  originY: number,
  items: PictureDrawItem[],
): SkPicture {
  const fullKey = `${LAYOUT_REV}:${key}`;
  if (fullKey === cachedKey && cachedPicture) return cachedPicture;
  cachedPicture?.dispose?.();
  cachedPicture = recordBuildingsPicture(worldW, worldH, originX, originY, items);
  cachedKey = fullKey;
  return cachedPicture;
}

export function clearBuildingsPictureCache(): void {
  cachedPicture?.dispose?.();
  cachedPicture = null;
  cachedKey = '';
}
