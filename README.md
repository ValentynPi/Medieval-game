# Holdfast: Crown of the Marches

PC browser strategy prototype — grow a medieval village into a stronghold, survive raids, and claim the Border Marches.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## Play

1. Place **Farms** / **Lumber Camps**, then a **Barracks**.
2. Train troops and set your **garrison** for defense.
3. Survive timed **raids** (Space pauses — real-time with pause).
4. Open the **World Map**, march on hostile camps.
5. **Win:** clear all camps with Keep level 4+.

Garrison (wall) fights village raids. Troops left outside the garrison form the field army for World Map marches.

## Controls

- **Left click** — select / place buildings
- **WASD / arrows**, **right-drag**, or **Shift/Alt-drag** — pan
- **Mouse wheel** — zoom
- **Space** — pause battles
- **Shift+1/2/3** — battle speed

## Stack

Vite + TypeScript + Three.js (stylized isometric 3D village).
