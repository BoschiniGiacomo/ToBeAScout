import { Skia, type SkPicture } from '@shopify/react-native-skia';
import { TILE_H, TILE_W, footprintCenterScreen } from '../sim/iso';
import { getSkiaImage } from './spriteCache';

export type PictureDrawItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  sprite: number | null;
};

function layoutSprite(item: PictureDrawItem) {
  const c = footprintCenterScreen(item.x, item.y, item.w, item.h);
  const bw = Math.max(36, (item.w + item.h) * (TILE_W / 2) * 0.9);
  const bh = item.sprite ? Math.max(48, bw * 0.9) : Math.max(24, item.h * TILE_H * 0.85 + 14);
  const southY = c.y + ((item.w + item.h - 2) * TILE_H) / 4;
  return {
    left: c.x - bw / 2,
    top: southY - bh + TILE_H * 0.15,
    bw,
    bh,
  };
}

/** Buildings only — rebuilt when layout/sprites change, terrain stays cached. */
export function recordBuildingsPicture(
  worldW: number,
  worldH: number,
  items: PictureDrawItem[],
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, worldW, worldH));
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
