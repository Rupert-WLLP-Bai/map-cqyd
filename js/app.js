// js/app.js
//
// Main controller for the map-cqyd demo. Owns the shared state object
// (CONTRACT.md §2) and switches between the two views:
//   - map view      (#map-view, Leaflet)        -> visible by default
//   - building view (#building-view, interior) -> hidden via .view--hidden
//
// Flow:
//   init()             -> fetchBuildings() -> initMapView(#map-view, list,
//                         onSelectBuilding)
//   onSelectBuilding   -> fetchBuilding(id) -> showBuilding(building)
//   showBuilding       -> initBuildingView(#building-view, building, onBack)
//   onBack             -> showMap (dispose building view, restore map)
//
// Data comes from the mock backend over HTTP (js/api.js); the list call has
// no floor detail, so a building's floors are fetched on selection. Failures
// surface as a toast and leave the current view alone. ES module. No build.

import { fetchBuildings, fetchBuilding, ApiError, showToast } from './api.js';
import { initMapView } from './map-view.js';
import { initBuildingView } from './building-view.js';

const mapViewEl = document.getElementById('map-view');
const buildingViewEl = document.getElementById('building-view');

if (!mapViewEl || !buildingViewEl) {
  throw new Error('app.js: #map-view and #building-view mounts are required');
}

// Shared state (CONTRACT.md §2). Owned here; other modules do not mutate it.
const state = {
  view: 'map',            // 'map' | 'building'
  buildingId: null,       // string | null
  floorNo: 1,             // 1-based
  direction: null,        // 'Dong'|'Nan'|'Xi'|'Bei' | null
};

let mapHandle = null;     // { invalidateSize } from initMapView
let buildingHandle = null; // { dispose } from initBuildingView
let loading = false;      // a building detail request is in flight

function messageFor(err, fallback) {
  return err && err.message ? err.message : fallback;
}

// --- view switching --------------------------------------------------------

function showMap() {
  // tear down the building view (disposes the 3D scene to avoid leaks).
  // dispose() is idempotent, so calling it here even if the back button
  // already did is a safe no-op.
  if (buildingHandle) {
    try { buildingHandle.dispose(); } catch (_) { /* noop */ }
    buildingHandle = null;
  }

  state.view = 'map';
  state.buildingId = null;

  buildingViewEl.classList.add('view--hidden');
  mapViewEl.classList.remove('view--hidden');

  // Leaflet mis-measures tiles when its container was display:none; ask it
  // to recompute now that it's visible again.
  if (mapHandle) {
    requestAnimationFrame(() => {
      try { mapHandle.invalidateSize(); } catch (_) { /* noop */ }
    });
  }
}

// `building` is a detail payload from GET /api/buildings/:id — it must carry
// floors, which the map list payload does not.
function showBuilding(building) {
  if (!building || !Array.isArray(building.floors) || building.floors.length === 0) {
    console.warn('app.js: building detail without floors', building);
    showToast('该楼宇没有楼层数据');
    return;
  }

  // safety: dispose any leftover building view first.
  if (buildingHandle) {
    try { buildingHandle.dispose(); } catch (_) { /* noop */ }
    buildingHandle = null;
  }

  state.view = 'building';
  state.buildingId = building.id;
  state.floorNo = building.floors[0] ? building.floors[0].floorNo : 1;
  state.direction = null;

  // show the building container BEFORE init so #b3d has a measured size for
  // the Three.js renderer; the 3D module reads clientWidth/Height at init.
  mapViewEl.classList.add('view--hidden');
  buildingViewEl.classList.remove('view--hidden');

  buildingHandle = initBuildingView(buildingViewEl, building, () => {
    // onBack from building-view: it has already disposed itself.
    buildingHandle = null;
    showMap();
  });
}

// --- selection -------------------------------------------------------------

// Marker click -> fetch that building's floors, then enter it. Minimal
// loading state: ignore further clicks and show a busy cursor while the
// request is in flight (map-view.js keeps its synchronous signature).
async function onSelectBuilding(id) {
  if (loading) return;
  loading = true;
  mapViewEl.style.cursor = 'progress';

  try {
    showBuilding(await fetchBuilding(id));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      showToast('未找到该楼宇');
    } else {
      showToast(messageFor(err, '楼宇详情加载失败'));
    }
  } finally {
    loading = false;
    mapViewEl.style.cursor = '';
  }
}

// --- boot -----------------------------------------------------------------

async function init() {
  let buildings;
  try {
    buildings = await fetchBuildings();
  } catch (err) {
    showToast(messageFor(err, '楼宇列表加载失败'));
    return;
  }

  // initMapView fits bounds to the markers; an empty list has no bounds.
  if (buildings.length === 0) {
    showToast('后端未返回任何楼宇', 'info');
    return;
  }

  mapHandle = initMapView(mapViewEl, buildings, (id) => {
    onSelectBuilding(id);
  });
}

init();

// Esc returns to the map from the building view (handy for a live demo).
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.view === 'building') {
    showMap();
  }
});
