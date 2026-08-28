import { Skia, type SkPicture } from '@shopify/react-native-skia';
import { TILE_H, TILE_W, gridToScreen, worldLayout } from '../sim/iso';

const terrainCache = new Map<number, SkPicture>();

function addTileDiamond(path: ReturnType<typeof Skia.Path.Make>, gx: number, gy: number) {
  const c = gridToScreen(gx, gy);
  path.moveTo(c.x, c.y - TILE_H / 2);
  path.lineTo(c.x + TILE_W / 2, c.y);
  path.lineTo(c.x, c.y + TILE_H / 2);
  path.lineTo(c.x - TILE_W / 2, c.y);
  path.close();
}

/** Baked isometric ground — lightweight path tiles (no grass textures). */
export function getTerrainPicture(
  worldW: number,
  worldH: number,
  gridSize: number,
): SkPicture {
  const cached = terrainCache.get(gridSize);
  if (cached) return cached;

  const { originX, originY } = worldLayout(gridSize);
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, worldW, worldH));
  canvas.translate(originX, originY);
  const even = Skia.Path.Make();
  const odd = Skia.Path.Make();
  const fill = Skia.Paint();

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      addTileDiamond((gx + gy) % 2 === 0 ? even : odd, gx, gy);
    }
  }
  fill.setColor(Skia.Color('#4E9B4A'));
  canvas.drawPath(even, fill);
  fill.setColor(Skia.Color('#468C42'));
  canvas.drawPath(odd, fill);

  const edge = Skia.Path.Make();
  for (let i = 0; i < gridSize; i++) {
    addTileDiamond(edge, i, 0);
    addTileDiamond(edge, 0, i);
    addTileDiamond(edge, gridSize - 1, i);
    addTileDiamond(edge, i, gridSize - 1);
  }
  const stroke = Skia.Paint();
  stroke.setStyle(1);
  stroke.setColor(Skia.Color('#356832'));
  stroke.setStrokeWidth(1.25);
  canvas.drawPath(edge, stroke);

  const picture = recorder.finishRecordingAsPicture();
  terrainCache.set(gridSize, picture);
  return picture;
}
