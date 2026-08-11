# CONTRACT.md

Shared contract for the map-cqyd demo. All agents implement against this.
Scope: an interactive, performative DEMO for leadership. CLARITY over flash.
No flashy animations. Network is available for online map tiles; everything
else is canned test data.

---

## 1. Data shapes

```ts
Building = {
  id: string,            // e.g. 'BLD-A'
  name: string,          // Chinese display name
  lat: number, lng: number,
  address: string,
  floors: Floor[],
  footprint: [[x, y], ...] | null   // optional hand-curated polygon (local coords); null = default rectangle
}
Floor    = { floorNo: number, label: string, cables: Cable[] }
Cable    = {
  id: string,
  name: string,
  direction: 'Dong' | 'Nan' | 'Xi' | 'Bei',  // east/south/west/north
  io: 'in' | 'out',
  peer: string,
  type: string,
  cores: number,
}
Equipment = {
  id: string,
  buildingId: string,
  type: '一级配电箱' | '二级配电箱' | 'OTN' | '光交',
  floorNo: number,
  roomId: string,
  status: 'online' | 'offline',
  position: { x: number, y: number }   // local floor coords, both in [0, 1]
}
Room      = {
  id: string,
  buildingId: string,
  name: string,
  floorNo: number,
  type: 'main' | 'aux' | 'riser'       // 主设备间 / 辅助间 / 弱电井
}
```

- Direction labels shown in Chinese in the UI: `Dong=东, Nan=南, Xi=西, Bei=北`
  (see `js/data.js` `DIRECTION_ZH`).
- Each floor has 1+ cables spread across all 4 directions, in/out mix.
- ~1,000 buildings, each 4-8 floors. Buildings are served by the mock
  backend described in §5 below; the front end does not import any
  canned BUILDINGS array directly.
- **Equipment type enum**: `'一级配电箱' | '二级配电箱' | 'OTN' | '光交'`.
- **Equipment status enum**: `'online' | 'offline'`.
- **Room type enum**: `'main' | 'aux' | 'riser'`.
- **Cable stays in the data model but is NOT rendered in v3** — it is
  retained for a future v4 topology view.

## 2. Shared state

```ts
state = {
  view: 'map' | 'building',
  buildingId: string | null,
  floorNo: number,            // 1-based
  direction: string | null,  // 'Dong'|'Nan'|'Xi'|'Bei' or null
}
```

Owned/mutated by `js/app.js`. Other modules receive explicit args/callbacks
and do not mutate this object directly unless `app.js` hands it to them.

## 3. DOM mount ids (in `index.html`)

| id / selector            | role                                                |
|--------------------------|-----------------------------------------------------|
| `#map-view`              | Leaflet map root (visible in map view)              |
| `#building-view`         | interior view root; hidden via `.view--hidden`      |
| `#bld-name`              | span: current building name                         |
| `#btn-back`              | button: back to map                                  |
| `#b3d`                   | Three.js canvas mount (right ~40%)                  |
| `#floor-pager`           | nav: prev/next + label                               |
| `#pager-prev`            | button: previous floor                               |
| `#pager-next`           | button: next floor                                   |
| `#floor-label`           | span: current floor label                            |
| `#floor-panel`           | container for the per-floor cable list (left ~60%)  |

Layout split: left ~60% = `#floor-pager` + `#floor-panel`; right ~40% = `#b3d`.

Module script: `<script type="module" src="./js/app.js"></script>`.

## 4. Module APIs (all ES modules under `js/`)

### `js/data.js`  (scaffold owner — DONE)
```js
export const BUILDINGS: Building[]          // 3 buildings, canned
export const DIRECTIONS = ['Dong','Nan','Xi','Bei']
export const DIRECTION_ZH = { Dong:'东', Nan:'南', Xi:'西', Bei:'北' }
```

### `js/map-view.js`
```js
export function initMapView(container: HTMLElement, buildings: Building[],
                            onSelectBuilding: (id: string) => void)
```
Renders a Leaflet map centered on the buildings. One marker per building
(clickable). Clicking a marker calls `onSelectBuilding(id)`. Online tiles OK.

### `js/floor-panel.js`
```js
export function renderFloorPanel(container: HTMLElement, floor: Floor): {
  highlightDirection(dir: 'Dong'|'Nan'|'Xi'|'Bei' | null): void
}
```
Renders the per-floor cable list GROUPED BY DIRECTION. Each direction is a
collapsible group (`.dir-group`), collapsed by default, showing per-direction
in/out counts in the header (`.dir-group__counts`). Expanding reveals the
cable detail table for that direction. Must NOT render a flat list of 15+
ungrouped cables. `highlightDirection(dir)` visually marks the matching
group and returns nothing; `null` clears it.

### `js/building3d.js`
```js
export function initBuilding3D(container: HTMLElement, building: Building): {
  setActiveFloor(floorNo: number): void,
  setActiveDirection(dir: 'Dong'|'Nan'|'Xi'|'Bei' | null): void,
  dispose(): void
}
```
Minimal Three.js building WIREFRAME only. Highlights the current floor and
the selected facade direction. Drag-to-rotate only; no auto-rotate, no
flythrough, no particles/glow/animations. Imports `three` via the bare
specifier resolved by the import map in `index.html`:
`import * as THREE from 'three';`. NO cables drawn in 3D.

### `js/building-view.js`  (integration agent composes this)
```js
export function initBuildingView(container: HTMLElement, building: Building,
                                 onBack: () => void)
```
Composes `floor-panel.js` + `building3d.js` + the `#floor-pager`. Wires
prev/next, sets floor label, and on floor/direction changes calls the
panel's `highlightDirection` and the 3D `setActiveFloor`/`setActiveDirection`
in step. Sets `#bld-name`. Wires `#btn-back` → `onBack`.

### `js/app.js`  (integration agent writes this)
Main controller. Imports `BUILDINGS` from `data.js`, `initMapView` from
`map-view.js`, `initBuildingView` from `building-view.js`. Owns the shared
`state`. Switches `#map-view` / `#building-view` visibility via the
`.view--hidden` class. `onSelectBuilding` → switch to building view and
init `building-view`. `onBack` → dispose building view, return to map.

## 5. API contract (mock backend)

The demo is served by a single Node Express process (`server/index.js`)
that boots the in-memory dataset once and exposes it read-only:

```
GET /api/buildings
  200 [{ id, name, lng, lat, address, floorCount, cableCount,
         equipmentTypes: string[]   // distinct Equipment.type values present in this building
       }, ...]
  (list of ~1k summaries; floors/rooms/equipment/cables are NOT inlined)

GET /api/buildings/:id
  200 { id, name, lng, lat, address, floorCount, cableCount,
         equipmentTypes: string[],
         footprint: [[x, y], ...] | null,         // polygon or null (default rectangle)
         rooms:     [{ id, name, floorNo, type }],
         equipment: [{ id, buildingId, type, floorNo, roomId, status, position: { x, y } }],
         floors:    [{ floorNo, label, cables: [Cable, ...] }, ...]   // cables still returned for v4
       }
  404 { error: 'not found', id }
```

- All responses are JSON. No pagination: the full list is < 200KB,
  per-building detail < 50KB.
- The front end talks to the backend via `js/api.js` only; it does NOT
  import any canned BUILDINGS array.

## 6. Red lines (must hold)

1. **NO cables drawn in 3D.** The 3D scene is ONLY a building wireframe
   anchor: floor highlight + facade highlight.
2. **Per-floor list is GROUPED BY DIRECTION** (collapsed counts by default),
   NEVER a flat list of 15+ items.
3. **3D stays MINIMAL** — no flythrough, no auto-rotate, no particle/glow/
   animation gimmicks; just a wireframe the viewer can drag to rotate.
4. **All ~1k buildings lie within the 两江新区 bbox** —
   `lng ∈ [106.48, 106.72]`, `lat ∈ [29.52, 29.74]`. Samples that fall
   outside are rejected by the generator.
5. **Cable schema is unchanged** from v1: every cable is
   `{ id, name, direction, io, peer, type, cores }`.
6. **Mock backend: no database.** Data is generated once at boot
   (fixed seed → stable across restarts) and is read-only. No
   write/edit/delete endpoints exist.
7. **Leaflet + Three.js via CDN** (script tag or ESM); zero build step.
8. **v3 red-line** — v3 replaces the cable-as-primary model with
   `Equipment` + `Room` as first-class entities. Cables are still
   generated and served (the detail endpoint keeps `floors[].cables`)
   for the v4 topology view, but they are **NOT rendered** anywhere
   in the v3 UI.

## 7. How to run

Run the Node Express mock backend (it also serves the static front end
on the same port; ESM modules need http, not `file://`):
```
cd /Users/pejoyll/Desktop/code/map-cqyd
npm install
node server/index.js
# open http://localhost:8000
```
