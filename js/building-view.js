// js/building-view.js
//
// Composes the interior view for one building:
//   - Three.js wireframe anchor (right, #b3d) -> initBuilding3D
//       (slabs are clickable to jump floors; onSelectFloor drives idx)
//   - Floor pager (#floor-pager prev/next + a #floor-select dropdown to jump)
//   - Per-floor equipment panel (left, #floor-panel) -> renderFloorPanel
//
// The v3 panel replaces the v2 per-direction cable groups with a flat
// equipment list (一级/二级 配电箱 + 仅异常 filter). Cables are still
// counted server-side and shown as bundle markers in 3D, but never as rows.
//
// Floor change (pager / dropdown / 3D slab click / 3D bundle click)
// -> setActiveFloor + re-render panel with the new floor's rooms + equipment.
// Back button (#btn-back) -> dispose 3D, then onBack().
//
// State held here: floor index (into building.floors) + active direction
// (still drives the 3D facade highlight on bundle selection, but the v3
// panel has no direction concept of its own).
// app.js owns the higher-level shared state. ES module.

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
  const floorSelect = container.querySelector('#floor-select');
  const bldName = container.querySelector('#bld-name');
  const btnBack = container.querySelector('#btn-back');

  if (!b3dEl || !panelEl || !pagerPrev || !pagerNext || !floorSelect) {
    throw new Error('initBuildingView: required DOM mounts missing');
  }

  const floors = building.floors;
  // v3 detail payload: rooms + equipment sit at the building level (not per
  // floor). Pre-filter them per floor when wiring the panel.
  const allRooms = Array.isArray(building.rooms) ? building.rooms : [];
  const allEquipment = Array.isArray(building.equipment) ? building.equipment : [];

  if (bldName) bldName.textContent = building.name;

  // --- local state ---
  let idx = 0;              // index into floors[]; current floor
  let activeDir = null;     // 'Dong'|'Nan'|'Xi'|'Bei' | null
  let panelHandle = null;   // { highlightRoom, setFilter, getFilter } from renderFloorPanel
  let disposed = false;

  // --- 3D wireframe anchor (slabs clickable to jump floors; bundle markers
  //     on each facade clickable to jump floors AND highlight that direction) ---
  const three = initBuilding3D(b3dEl, building, {
    onSelectFloor: (floorNo) => {
      if (disposed) return;
      const i = floors.findIndex((f) => f.floorNo === floorNo);
      if (i >= 0 && i !== idx) { idx = i; renderCurrent(); }
    },
    onSelectBundle: (floorNo, dir) => {
      if (disposed) return;
      const i = floors.findIndex((f) => f.floorNo === floorNo);
      // Sync the active direction, then jump floors so the panel re-renders
      // for the right floor.
      activeDir = dir;
      if (i >= 0) idx = i;
      renderCurrent();
    },
  });

  // --- floor rendering / paging ---
  function renderCurrent() {
    const floor = floors[idx];
    // The <select> shows "label · pos/total"; sync its value to the current
    // floor. Setting .value programmatically does NOT fire 'change'.
    floorSelect.value = String(idx);

    // v3 panel: pass rooms + equipment pre-filtered to this floorNo.
    // The panel itself does the type / 仅异常 filtering.
    const floorNo = floor ? floor.floorNo : null;
    const rooms = floorNo == null
      ? []
      : allRooms.filter((r) => r && r.floorNo === floorNo);
    const equipment = floorNo == null
      ? []
      : allEquipment.filter((e) => e && e.floorNo === floorNo);

    panelHandle = renderFloorPanel(panelEl, floor, { rooms, equipment });

    three.setActiveFloor(floor ? floor.floorNo : null);
    three.setActiveDirection(activeDir);
    updatePagerButtons();
  }

  function updatePagerButtons() {
    pagerPrev.disabled = idx <= 0;
    pagerNext.disabled = idx >= floors.length - 1;
  }

  // Floor dropdown: jump straight to any floor (scales to 20+ floors).
  floorSelect.replaceChildren(); // clear any options from a previous entry
  for (let i = 0; i < floors.length; i += 1) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${floors[i].label}  ·  ${i + 1}/${floors.length}`;
    floorSelect.appendChild(opt);
  }
  floorSelect.addEventListener('change', () => {
    if (disposed) return;
    const i = Number(floorSelect.value);
    if (Number.isInteger(i) && i >= 0 && i < floors.length && i !== idx) {
      idx = i;
      renderCurrent();
    }
  });

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
    if (floorSelect) floorSelect.replaceChildren();
    panelHandle = null;
  }

  // --- initial render ---
  renderCurrent();

  return { dispose };
}
