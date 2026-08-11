# map-cqyd — 重庆楼宇线缆可视化 Demo

A laptop-sized, interactive demo for leadership: clarity over flash, no
flashy animations.

## What it is

- **Map view** — a Leaflet 2D map (online tiles) with one marker per
  building. Click a building marker to enter its interior view.
- **Building (interior) view** — paginated per-floor view. Each floor shows
  its cable inventory as a list **grouped by facade direction**
  (东 Dong / 南 Nan / 西 Xi / 北 Bei). Each direction is a collapsible group,
  collapsed by default to per-direction in/out counts; click to expand and
  see the cable detail. A minimal **Three.js building wireframe** sits as a
  spatial anchor on the right, highlighting the current floor and the
  selected facade. It can be dragged to rotate. Cables are NOT drawn in 3D.

## Scope (v2)

- **~1,000 buildings, all inside the 两江新区 bounding box**
  (`lng ∈ [106.48, 106.72]`, `lat ∈ [29.52, 29.74]`).
- Buildings are placed in **6 CBD clusters** (江北嘴 / 光电园 / 幸福广场 /
  观音桥 / 龙兴 / 汽博 — Gaussian scatter, ~70% of buildings) plus
  **6 main-street corridors** (金渝大道 / 金开大道 / 渝澳大道 / 北滨一路 /
  机场路 / 龙驿大道 — strip scatter along a line segment, ~30%).
- **~10,000 cables total** (≈10 per floor on average, log-normal spread so a
  few "equipment rooms" carry 50–200).
- Served by a **single mock Node Express backend** (`server/index.js`):
  data is generated once at boot from a fixed seed (no database),
  held in memory, and exposed read-only under `/api/buildings`.
- **Map density**: 1k markers are grouped with **Leaflet.markercluster**
  (CDN). Cluster bubbles show counts; click to zoom-and-spiderfy, click a
  single marker to enter its interior view.
- **Left panel**: per-floor cable list uses a **virtual scroll** (fixed
  28px row height, only visible rows + buffer rendered) so a 200-item
  floor stays smooth; the direction-grouped collapse from v1 is preserved.

## Stack

Vanilla JS ES modules — **no build step.** Leaflet, **Leaflet.markercluster**,
and Three.js all via CDN. Three.js is loaded as an ES module through an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)
in `index.html`, so modules do `import * as THREE from 'three'`. The only
npm dependency is **Express**, used by the single mock backend.

## Project layout

```
index.html              # shell: CDN imports + #map-view / #building-view mounts
css/styles.css          # clean laptop styles, collapsed direction groups
js/data.js              # canned BUILDINGS data + DIRECTION_ZH
js/map-view.js          # Leaflet init + building markers   (separate agent)
js/floor-panel.js       # per-floor list grouped by direction (separate agent)
js/building3d.js        # minimal Three.js wireframe anchor  (separate agent)
js/building-view.js     # composes floor-panel + building3d + pager (integration)
js/app.js               # controller: map <-> building view switching (integration)
CONTRACT.md             # module APIs, DOM ids, state, red lines
```

## How to run

ES modules require an http origin (not `file://`). Run the mock backend
(it also serves the static front end on the same port), then open the
printed URL:

```bash
cd /Users/pejoyll/Desktop/code/map-cqyd
npm install            # installs Express (only runtime dep)
node server/index.js   # listens on :8000, prints generated building/cable counts
# open http://localhost:8000
```

## Demo flow

1. Map loads, centered on the three Chongqing buildings.
2. Click a building marker → switch to the interior view.
3. Use ‹ / › (or the pager buttons) to move between floors.
4. Each floor lists cables grouped by direction, collapsed to in/out counts;
   click a group header to expand the cable table.
5. Click the back button to return to the map.
