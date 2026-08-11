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
  floors: Floor[]
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
```

- Direction labels shown in Chinese in the UI: `Dong=东, Nan=南, Xi=西, Bei=北`
  (see `js/data.js` `DIRECTION_ZH`).
- Each floor has 15+ cables spread across all 4 directions, in/out mix.
- 3 buildings, each 4-8 floors. Canned only — NO fetch to any backend.

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

## 5. Red lines (must hold)

1. **NO cables drawn in 3D.** The 3D scene is ONLY a building wireframe
   anchor: floor highlight + facade highlight.
2. **Per-floor list is GROUPED BY DIRECTION** (collapsed counts by default),
   NEVER a flat list of 15+ items.
3. **3D stays MINIMAL** — no flythrough, no auto-rotate, no particle/glow/
   animation gimmicks; just a wireframe the viewer can drag to rotate.
4. **Test/canned data ONLY** — no fetch to any backend, no real
   resource-management-system integration.
5. **Leaflet + Three.js via CDN** (script tag or ESM); zero npm, zero build step.

## 6. How to run

Serve the dir statically (ESM needs http, not file://):
```
cd /Users/pejoyll/Desktop/code/map-cqyd
python3 -m http.server 8000
# open http://localhost:8000
```
