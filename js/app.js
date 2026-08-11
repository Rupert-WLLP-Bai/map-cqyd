// js/app.js
//
// Main controller for the map-cqyd demo. Owns the shared state object
// (CONTRACT.md §2) and switches between the two views:
//   - map view      (#map-view, Leaflet)        -> visible by default
//   - building view (#building-view, interior) -> hidden via .view--hidden
//
// Flow:
//   initMapView(#map-view, BUILDINGS, id => showBuilding(id))
//   showBuilding -> initBuildingView(#building-view, building, onBack)
//   onBack       -> showMap (dispose building view, restore map)
//
// Canned data only. No backend. ES module. No build step.

import { BUILDINGS } from './data.js';
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

function findBuilding(id) {
  return BUILDINGS.find((b) => b.id === id) || null;
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

function showBuilding(id) {
  const building = findBuilding(id);
  if (!building) {
    console.warn('app.js: unknown building id', id);
    return;
  }

  // safety: dispose any leftover building view first.
  if (buildingHandle) {
    try { buildingHandle.dispose(); } catch (_) { /* noop */ }
    buildingHandle = null;
  }

  state.view = 'building';
  state.buildingId = id;
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

// --- boot -----------------------------------------------------------------

mapHandle = initMapView(mapViewEl, BUILDINGS, (id) => {
  showBuilding(id);
});

// Esc returns to the map from the building view (handy for a live demo).
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.view === 'building') {
    showMap();
  }
});
