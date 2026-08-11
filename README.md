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
- Data is **canned test data only** (3 buildings in Chongqing, 4–8 floors
  each, 15–25 cables per floor spread across the 4 directions). No backend,
  no resource-management-system integration.

## Stack

Vanilla JS ES modules — **no build step, no npm, no backend.**
Leaflet + Three.js via CDN. Three.js is loaded as an ES module through an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)
in `index.html`, so modules do `import * as THREE from 'three'`.

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

ES modules require an http origin (not `file://`). Serve the directory
statically, then open the printed URL:

```bash
cd /Users/pejoyll/Desktop/code/map-cqyd
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works (e.g. `npx serve`, `php -S localhost:8000`) as long
as it serves over http(s).

## Demo flow

1. Map loads, centered on the three Chongqing buildings.
2. Click a building marker → switch to the interior view.
3. Use ‹ / › (or the pager buttons) to move between floors.
4. Each floor lists cables grouped by direction, collapsed to in/out counts;
   click a group header to expand the cable table.
5. Click the back button to return to the map.
