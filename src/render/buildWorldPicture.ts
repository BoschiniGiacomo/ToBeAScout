import { Skia, type SkPicture } from '@shopify/react-native-skia';
import { TILE_H, TILE_W, footprintCenterScreen, gridToScreen } from '../sim/iso';
import { getSkiaImage } from './spriteCache';

export type PictureDrawItem = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  sprite: number | null;
};

function addTileDiamond(path: ReturnType<typeof Skia.Path.Make>, gx: number, gy: number) {
  const c = gridToScreen(gx, gy);
  path.moveTo(c.x, c.y - TILE_H / 2);
  path.lineTo(c.x + TILE_W / 2, c.y);
  path.lineTo(c.x, c.y + TILE_H / 2);
  path.lineTo(c.x - TILE_W / 2, c.y);
  path.close();
}

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

function buildGroundPaths(gridSize: number) {
  const even = Skia.Path.Make();
  const odd = Skia.Path.Make();
  const edge = Skia.Path.Make();
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      addTileDiamond((gx + gy) % 2 === 0 ? even : odd, gx, gy);
    }
  }
  for (let i = 0; i < gridSize; i++) {
    addTileDiamond(edge, i, 0);
    addTileDiamond(edge, 0, i);
    addTileDiamond(edge, gridSize - 1, i);
    addTileDiamond(edge, i, gridSize - 1);
  }
  return { even, odd, edge };
}

/** Record static world layer once (CoC-style baked terrain + buildings). */
export function recordWorldPicture(
  worldW: number,
  worldH: number,
  gridSize: number,
  items: PictureDrawItem[],
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, worldW, worldH));
  const fillPaint = Skia.Paint();
  const strokePaint = Skia.Paint();
  strokePaint.setStyle(1); // Stroke

  const { even, odd, edge } = buildGroundPaths(gridSize);
  fillPaint.setColor(Skia.Color('#4E9B4A'));
  canvas.drawPath(even, fillPaint);
  fillPaint.setColor(Skia.Color('#468C42'));
  canvas.drawPath(odd, fillPaint);
  strokePaint.setColor(Skia.Color('#356832'));
  strokePaint.setStrokeWidth(1.25);
  canvas.drawPath(edge, strokePaint);

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

export function worldDimensions(gridSize: number) {
  return {
    worldW: gridSize * TILE_W + 80,
    worldH: gridSize * TILE_H + 120,
  };
}
