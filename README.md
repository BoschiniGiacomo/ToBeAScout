# ToBeAScout

Gioco isometrico offline (stile Clash of Clans) ambientato nel percorso **AGESCI**:
Lupetti → Reparto → Noviziato → Clan → Comunità Capi.

## Prova sul telefono

```bash
npm start
```

Apri **Expo Go**, inquadra il QR. Stesso Wi‑Fi del PC.

## Cosa puoi fare

- Costruire e upgradare il campo (QG, depositi, tende, difese…)
- Addestrare specialità / brevetti
- Affrontare missioni AI (hike, ROSS, CFT, CFM, CFA…)
- Progressione a 5 ere finite (non infinite)

## Struttura

- `src/sim` — simulazione pura (griglia, economia, training, combat, campagna)
- `src/render` — mondo isometrico Skia + pipeline sprite
- `src/content` — JSON edifici / truppe / missioni / ere
- `src/save` — salvataggio AsyncStorage offline
- `app` — schermate Expo Router
- `assets/ASSETS.md` — come aggiungere PNG pre-rendered

## Stack

Expo + TypeScript + React Native Skia + Gesture Handler + Reanimated
