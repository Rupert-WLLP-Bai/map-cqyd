// js/building-view.js
//
// Composes the interior view for one building:
//   - Three.js wireframe anchor (right, #b3d)  -> initBuilding3D
//   - Floor pager (#floor-pager prev/next + #floor-label)
//   - Per-floor cable panel grouped by direction (left, #floor-panel)
//     -> renderFloorPanel
//   - A small row of direction pills (东/南/西/北) this view exposes so the
//     viewer can drive the facade highlight from the building-view UI.
//
// BIDIRECTIONAL direction sync (the red-line reason this module exists):
//   - panel direction group click  -> 3D setActiveDirection + pill active
//   - direction pill click         -> 3D setActiveDirection + panel
//                                     highlightDirection (mark + expand)
//   - floor change (pager)         -> 3D setActiveFloor + re-render panel,
//                                     re-apply the current direction
//   - back button (#btn-back)      -> dispose 3D, then onBack()
//
// State held here: floor index (into building.floors) + active direction.
// app.js owns the higher-level shared state; this module just does what its
// args + DOM tell it to. Canned data only. ES module.

import { initBuilding3D } from './building3d.js';
import { renderFloorPanel } from './floor-panel.js';

export function initBuildingView(container, building, onBack) {
  if (!container) throw new Error('initBuildingView: container is required');
  if (!building || !Array.isArray(building.floors) || building.floors.length === 0) {
    throw new Error('initBuildingView: building with floors is required');
  }
  if (typeof onBack !== 'function') {
    throw new Error('initBuildingView: onBack callback is required');
  }

  // --- DOM mounts (per index.html / CONTRACT.md) ---
  const b3dEl = container.querySelector('#b3d');
  const panelEl = container.querySelector('#floor-panel');
  const pagerPrev = container.querySelector('#pager-prev');
  const pagerNext = container.querySelector('#pager-next');
  const floorLabel = container.querySelector('#floor-label');
  const bldName = container.querySelector('#bld-name');
  const btnBack = container.querySelector('#btn-back');

  if (!b3dEl || !panelEl || !pagerPrev || !pagerNext || !floorLabel) {
    throw new Error('initBuildingView: required DOM mounts missing');
  }

  const floors = building.floors;
  if (bldName) bldName.textContent = building.name;

  // --- local state ---
  let idx = 0;              // index into floors[]; current floor
  let activeDir = null;     // 'Dong'|'Nan'|'Xi'|'Bei' | null
  let panelHandle = null;   // { highlightDirection } from renderFloorPanel
  let disposed = false;

  // --- 3D wireframe anchor ---
  const three = initBuilding3D(b3dEl, building);

  // --- direction sync ---
  // The per-floor panel's direction group headers are the SINGLE direction
  // selector: a group click drives the 3D facade highlight. No second pill
  // bar — two parallel selectors were redundant clutter for a clarity demo.
  function setDirection(dir) {
    activeDir = dir;
    three.setActiveDirection(dir);
  }

  // --- floor rendering / paging ---
  function renderCurrent() {
    const floor = floors[idx];
    // Show position in the stack so a leader can tell "3F of 8" at a glance.
    floorLabel.textContent = floor
      ? `${floor.label}  ·  ${idx + 1}/${floors.length}`
      : '—';
    // Re-render the panel for this floor. Pass a notify callback so a
    // direction group click syncs 3D + pills (fromPanel=true).
    panelHandle = renderFloorPanel(panelEl, floor, (dir) => {
      setDirection(dir);
    });
    // 3D floor highlight for the new floor.
    three.setActiveFloor(floor ? floor.floorNo : null);
    // re-apply the standing direction selection to the new floor's panel/3D.
    three.setActiveDirection(activeDir);
    if (panelHandle && activeDir) panelHandle.highlightDirection(activeDir);
    updatePagerButtons();
  }

  function updatePagerButtons() {
    pagerPrev.disabled = idx <= 0;
    pagerNext.disabled = idx >= floors.length - 1;
  }

  pagerPrev.addEventListener('click', () => {
    if (disposed) return;
    if (idx > 0) { idx -= 1; renderCurrent(); }
  });
  pagerNext.addEventListener('click', () => {
    if (disposed) return;
    if (idx < floors.length - 1) { idx += 1; renderCurrent(); }
  });

  // --- back ---
  btnBack.addEventListener('click', () => {
    if (disposed) return;
    dispose();
    onBack();
  });

  // --- dispose (idempotent; app.js may also call it on Escape) ---
  function dispose() {
    if (disposed) return;
    disposed = true;
    try { three.dispose(); } catch (_) { /* noop */ }
    if (panelEl) panelEl.replaceChildren();
    panelHandle = null;
  }

  // --- initial render ---
  renderCurrent();

  return { dispose };
}
