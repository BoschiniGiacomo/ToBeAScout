# Asset pipeline — ToBeAScout

Pre-rendered 3D buildings and troop sprites plug in **without changing simulation code**.

## Naming

| Type | Path pattern |
|------|----------------|
| Building | `assets/buildings/{buildingId}_lvl{level}.png` |
| Troop | `assets/troops/{troopId}.png` |

- `assets/buildings/qg_lvl1.png` ✅ (footprint 3×3)
- `assets/buildings/pozzo_lvl1.png` ✅
- `assets/buildings/deposito_legna_lvl1.png` ✅ (footprint 2×2)
- `assets/buildings/tenda_squadriglia_lvl1.png` ✅ (footprint 2×2)
- `assets/buildings/tenda_specialita_lvl1.png` ✅ (footprint 1×1)
- `assets/buildings/sopraelevata_lvl1.png` ✅ (footprint 2×2)
- `assets/icon.png` / `assets/logo.png` ✅ app icon & brand
- `assets/ui/app_logo.png` ✅ in-game logo
- `assets/tiles/grass_empty.png` (asset on disk; runtime ground uses light Views)
- `assets/troops/maestro_giochi.png` ✅
- `assets/troops/falegname.png` ✅

`buildingId` / `troopId` must match `src/content/buildings.json` and `troops.json`.

## JSON fields (already on each def)

```json
{
  "spriteKey": "building_qg",
  "footprint": { "w": 3, "h": 3 },
  "anchor": { "x": 0.5, "y": 1 }
}
```

- **footprint**: tiles occupied on the isometric grid
- **anchor**: normalized point on the sprite that sits on the footprint’s ground point (bottom-center = `0.5, 1`)
- **spriteKey**: logical key; map to PNG via `src/render/assets.ts`

## How to swap placeholders

1. Drop PNGs under `assets/buildings` / `assets/troops`
2. Register them in `src/render/assets.ts` (`require(...)` map)
3. Renderer uses footprint + anchor for placement and depth sort — no sim changes

## Tips for Blender / MagicaVoxel exports

- Isometric camera: rotation ~45° yaw, ~35.264° pitch (true iso)
- Transparent background PNG
- Keep a consistent ground shadow contact point (anchor)
- Export one PNG per building level when the model changes visually
