/**
 * Headless stress loop for map camera math (pan + pinch).
 * Run: node scripts/mapStressLoop.mjs
 */

const TILE_W = 64;
const TILE_H = 32;
const GRID = 14;
const MIN_SCALE = 0.55;
const MAX_SCALE = 2.2;

function gridToScreen(gx, gy) {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

function screenToGrid(sx, sy) {
  const gx = sx / (TILE_W / 2) + sy / (TILE_H / 2);
  const gy = sy / (TILE_H / 2) - sx / (TILE_W / 2);
  return { x: Math.floor(gx / 2), y: Math.floor(gy / 2) };
}

function eventToGrid(ex, ey, offsetX, offsetY, scale) {
  const s = scale > 0.01 ? scale : 1;
  return screenToGrid(ex / s - offsetX, ey / s - offsetY);
}

function worldBounds(gridSize) {
  const tl = gridToScreen(0, 0);
  const tr = gridToScreen(gridSize - 1, 0);
  const bl = gridToScreen(0, gridSize - 1);
  const br = gridToScreen(gridSize - 1, gridSize - 1);
  const TILE_W = 64;
  const TILE_H = 32;
  return {
    minX: Math.min(tl.x, tr.x, bl.x, br.x) - TILE_W / 2,
    maxX: Math.max(tl.x, tr.x, bl.x, br.x) + TILE_W / 2,
    minY: Math.min(tl.y, tr.y, bl.y, br.y) - TILE_H / 2,
    maxY: Math.max(tl.y, tr.y, bl.y, br.y) + TILE_H,
  };
}

function clampPan(ox, oy, viewW, viewH, scale, b) {
  const s = scale > 0.01 ? scale : 1;
  const m = 48;
  const loX = (viewW - m) / s - b.maxX;
  const hiX = m / s - b.minX;
  const loY = (viewH - m) / s - b.maxY;
  const hiY = m / s - b.minY;
  return {
    x: loX <= hiX ? Math.max(loX, Math.min(hiX, ox)) : (loX + hiX) / 2,
    y: loY <= hiY ? Math.max(loY, Math.min(hiY, oy)) : (loY + hiY) / 2,
  };
}

function applyPinch(offsetX, offsetY, scale, savedScale, focalX, focalY, pinchScale, viewW, viewH, b) {
  const prev = scale;
  const next = Math.min(2.2, Math.max(0.55, savedScale * pinchScale));
  if (prev <= 0.01) return { offsetX, offsetY, scale, savedScale: next };
  let ox = offsetX + focalX * (1 / next - 1 / prev);
  let oy = offsetY + focalY * (1 / next - 1 / prev);
  const clamped = clampPan(ox, oy, viewW, viewH, next, b);
  return { offsetX: clamped.x, offsetY: clamped.y, scale: next, savedScale: next };
}

function assertFinite(label, v) {
  if (!Number.isFinite(v)) throw new Error(`${label} not finite: ${v}`);
}

let failures = 0;
let passes = 0;

function check(name, fn) {
  try {
    fn();
    passes += 1;
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${name}:`, e.message);
  }
}

// --- round 1: grid conversion stability ---
for (let gy = 0; gy < GRID; gy++) {
  for (let gx = 0; gx < GRID; gx++) {
    check(`grid roundtrip ${gx},${gy}`, () => {
      const s = gridToScreen(gx, gy);
      const g = screenToGrid(s.x, s.y);
      if (Math.abs(g.x - gx) > 1 || Math.abs(g.y - gy) > 1) {
        throw new Error(`expected ~${gx},${gy} got ${g.x},${g.y}`);
      }
    });
  }
}

// --- round 2: pan stress with iso bounds ---
const BOUNDS = worldBounds(GRID);
check('pan reaches west tiles', () => {
  const viewW = 770;
  const viewH = 360;
  const clamped = clampPan(400, 200, viewW, viewH, 1, BOUNDS);
  if (clamped.x < 200) throw new Error(`west pan too restricted x=${clamped.x}`);
  const west = gridToScreen(0, 7);
  const screenX = (west.x + clamped.x) * 1;
  if (screenX < 0 || screenX > viewW) throw new Error(`west tile off screen at x=${screenX}`);
});

check('1000 pan updates', () => {
  let ox = 400;
  let oy = 300;
  for (let i = 0; i < 1000; i++) {
    ox += Math.sin(i * 0.17) * 12;
    oy += Math.cos(i * 0.13) * 9;
    const c = clampPan(ox, oy, 770, 360, 1, BOUNDS);
    ox = c.x;
    oy = c.y;
    assertFinite('ox', ox);
    assertFinite('oy', oy);
    const g = eventToGrid(ox, oy, ox - 100, oy - 80, 1);
    if (g.x < -20 || g.y < -20 || g.x > GRID + 20 || g.y > GRID + 20) {
      throw new Error(`grid out of bounds ${g.x},${g.y}`);
    }
  }
});

// --- round 3: pinch on building focal points ---
const buildingTiles = [
  [5, 5],
  [7, 4],
  [3, 8],
  [10, 6],
];
for (const [bx, by] of buildingTiles) {
  check(`pinch on building ${bx},${by}`, () => {
    let ox = 400;
    let oy = 300;
    let scale = 1;
    let saved = 1;
    const focal = gridToScreen(bx, by);
    for (let i = 0; i < 200; i++) {
      const pinch = 0.95 + (i % 10) * 0.02;
      const next = applyPinch(ox, oy, scale, saved, focal.x, focal.y, pinch, 770, 360, BOUNDS);
      ox = next.offsetX;
      oy = next.offsetY;
      scale = next.scale;
      saved = next.savedScale;
      assertFinite('scale', scale);
      if (scale < MIN_SCALE - 0.001 || scale > MAX_SCALE + 0.001) {
        throw new Error(`scale ${scale} out of clamp`);
      }
    }
  });
}

// --- round 4: combined pan+pinch loop (restart when done) ---
const ROUNDS = 3;
for (let round = 1; round <= ROUNDS; round++) {
  check(`combined loop round ${round}`, () => {
    let ox = 400;
    let oy = 300;
    let scale = 1;
    let saved = 1;
    let tapX = 200;
    let tapY = 150;
    for (let i = 0; i < 500; i++) {
      ox += (i % 7) - 3;
      oy += (i % 5) - 2;
      if (i % 17 === 0) {
        tapX = 200 + (i % 300);
        tapY = 150 + (i % 200);
        const pinch = i % 2 === 0 ? 1.08 : 0.92;
        const next = applyPinch(ox, oy, scale, saved, tapX, tapY, pinch, 770, 360, BOUNDS);
        ox = next.offsetX;
        oy = next.offsetY;
        scale = next.scale;
        saved = next.savedScale;
      }
      const g = eventToGrid(tapX, tapY, ox, oy, scale);
      assertFinite('gx', g.x);
      assertFinite('gy', g.y);
    }
  });
}

console.log(`\n[mapStressLoop] passes=${passes} failures=${failures}`);
process.exit(failures > 0 ? 1 : 0);
