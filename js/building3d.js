// js/building3d.js
//
// Minimal Three.js building wireframe anchor WITH per-floor per-facade
// BUNDLE MARKERS (one marker per floor x facade direction, no individual
// cables drawn in 3D).
//
// Exposes: initBuilding3D(container, building, opts?) -> {
//   setActiveFloor(floorNo), setActiveDirection(dir | null), dispose() }
//   opts.onSelectFloor(floorNo)      optional — fired when a floor slab is
//     clicked (Q2 many-floors navigation: click a slab to jump to that floor).
//   opts.onSelectBundle(floorNo, dir) optional — fired when a bundle marker
//     on facade `dir` at floor `floorNo` is clicked. Drives the left panel:
//     jump to that floor + highlight that direction.
//
// RED LINE: NO individual cables are drawn in 3D. The scene shows:
//   - a stack of floor slabs (thin wireframe boxes) as a spatial anchor,
//   - ONE bundle marker per floor x per facade direction (东/南/西/北),
//     mildly sized by total cable count, colored by in/out balance,
//     with a CSS2D count badge (`↑N ↓M`) and a hover label (`东 · 3F ...`).
// The active floor's slab + the selected facade are highlighted. The viewer
// can drag to rotate. No auto-rotate, no flythrough, no glow/particles.
//
// Direction -> facade mapping (consistent, per project contract):
//   东 Dong = +X     西 Xi = -X     南 Nan = +Z     北 Bei = -Z
//
// `three` and CSS2DRenderer are imported via CDN ESM; the bare 'three'
// specifier resolves through the import map in index.html (no build step).

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'https://unpkg.com/three@0.160.0/examples/jsm/renderers/CSS2DRenderer.js';

// Canonical direction order + Chinese label (kept local to avoid coupling).
const DIRS = ['Dong', 'Nan', 'Xi', 'Bei'];
const DIR_ZH = { Dong: '东', Nan: '南', Xi: '西', Bei: '北' };

const DIR_TO_SIDE = {
  Dong: { axis: 'x', sign: +1 }, // 东  = +X
  Xi:   { axis: 'x', sign: -1 }, // 西  = -X
  Nan:  { axis: 'z', sign: +1 }, // 南  = +Z
  Bei:  { axis: 'z', sign: -1 }, // 北  = -Z
};

const COLOR_DIM     = 0x9aa3b3; // neutral gray for inactive slabs / equal io
const COLOR_ACTIVE  = 0x2f6df6; // blue for the active floor
const COLOR_FACADE  = 0xff5a5f; // coral for the selected facade wash
const COLOR_IN      = 0x1f8a55; // green: in-dominant bundle
const COLOR_OUT     = 0xb4351f; // red:  out-dominant bundle
const COLOR_BG      = 0xf4f5f7;
const COLOR_GRID_MJ = 0xcfd3da;
const COLOR_GRID_MN = 0xe8eaee;

// Slab proportions (abstract; the scene is a spatial anchor, not to scale).
const SLAB_W = 4.0;  // X width
const SLAB_D = 4.0;  // Z depth
const SLAB_H = 1.0;  // Y height of one floor slab
const FLOOR_GAP = 0.2;
const FLOOR_STEP = SLAB_H + FLOOR_GAP;

// Bundle marker footprint (one per floor x facade).
const BUNDLE_W = 0.42; // along the facade's horizontal span
const BUNDLE_H = 0.42; // vertical
const BUNDLE_T = 0.14; // how far the marker sticks out from the facade

export function initBuilding3D(container, building, opts = {}) {
  if (!container) throw new Error('initBuilding3D: container is required');
  if (!building || !Array.isArray(building.floors) || building.floors.length === 0) {
    throw new Error('initBuilding3D: building with floors is required');
  }
  const onSelectFloor = typeof opts.onSelectFloor === 'function' ? opts.onSelectFloor : null;
  const onSelectBundle = typeof opts.onSelectBundle === 'function' ? opts.onSelectBundle : null;

  const floors = building.floors;
  const floorCount = floors.length;
  const buildingH = floorCount * FLOOR_STEP;

  // --- scene / camera / webgl renderer ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BG);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  const dist = Math.max(11, buildingH * 1.7);
  camera.position.set(dist * 0.72, buildingH * 0.85 + 2.5, dist * 0.92);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  // CSS2D overlay for count badges + hover labels. CSS (.b3d-overlay
  // { position:absolute; inset:0; pointer-events:none }) controls the
  // overlay's layout — we never write inline position/size/pointer-events,
  // so a layout-side bug in any of them can never feed back into the
  // container's ResizeObserver. CSS2DRenderer.constructor sets the
  // overlay's overflow:hidden for us.
  const cssRenderer = new CSS2DRenderer();
  cssRenderer.domElement.classList.add('b3d-overlay');
  container.appendChild(cssRenderer.domElement);

  // --- controls: drag to rotate only. No auto-rotate, no pan, no flythrough. ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.minDistance = 7;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, buildingH / 2, 0);
  controls.update();

  // --- building wireframe: one box (edges + faint fill) per floor, stacked ---
  const slabs = []; // { floorNo, y, lineSeg, fill, boxGeo, edgesGeo, lineMat, fillMat }
  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo; // 1-based per data contract
    const y = i * FLOOR_STEP + SLAB_H / 2;

    const boxGeo = new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_D);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    const lineMat = new THREE.LineBasicMaterial({ color: COLOR_DIM });
    const lineSeg = new THREE.LineSegments(edgesGeo, lineMat);
    lineSeg.position.set(0, y, 0);

    // Faint translucent fill so the active floor reads as a solid slab when
    // highlighted, without adding any glow / animation.
    const fillMat = new THREE.MeshBasicMaterial({
      color: COLOR_DIM,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(boxGeo, fillMat);
    fill.position.set(0, y, 0);
    fill.userData.floorNo = floorNo; // for raycaster click-to-jump

    scene.add(lineSeg, fill);
    slabs.push({ floorNo, y, lineSeg, fill, boxGeo, edgesGeo, lineMat, fillMat });
  }

  // Subtle ground grid as a spatial anchor (nothing flashy).
  const grid = new THREE.GridHelper(24, 24, COLOR_GRID_MJ, COLOR_GRID_MN);
  grid.position.y = -0.001;
  scene.add(grid);

  // --- facade plane: subtle wash on the active floor's selected facade ---
  const facadeGeoX = new THREE.PlaneGeometry(SLAB_D, SLAB_H);
  const facadeGeoZ = new THREE.PlaneGeometry(SLAB_W, SLAB_H);
  const facadeMat = new THREE.MeshBasicMaterial({
    color: COLOR_FACADE,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const facade = new THREE.Mesh(facadeGeoX, facadeMat);
  facade.visible = false;
  scene.add(facade);

  // --- bundle markers: ONE per floor x per facade direction ---
  // Shared geometry per side; per-bundle material so opacity/color can vary.
  const bundleGeoX = new THREE.BoxGeometry(BUNDLE_T, BUNDLE_H, BUNDLE_W); // sticks out along X
  const bundleGeoZ = new THREE.BoxGeometry(BUNDLE_W, BUNDLE_H, BUNDLE_T); // sticks out along Z

  const bundles = []; // { floorNo, dir, inN, outN, total, dominant, mesh, material, badge, badgeEl }
  const bundleMeshes = []; // flat list for raycast

  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo;
    const y = i * FLOOR_STEP + SLAB_H / 2;
    const floorLabel = floors[i].label || `${floorNo}F`;

    // tally this floor's cables per direction
    const tally = {
      Dong: { in: 0, out: 0 },
      Nan:  { in: 0, out: 0 },
      Xi:   { in: 0, out: 0 },
      Bei:  { in: 0, out: 0 },
    };
    for (const c of floors[i].cables || []) {
      if (!tally[c.direction]) continue;
      if (c.io === 'in') tally[c.direction].in += 1;
      else tally[c.direction].out += 1;
    }

    for (const dir of DIRS) {
      const inN = tally[dir].in;
      const outN = tally[dir].out;
      const total = inN + outN;
      const dominant = inN > outN ? 'in' : (outN > inN ? 'out' : 'eq');
      const baseColorHex = dominant === 'in' ? COLOR_IN
                         : dominant === 'out' ? COLOR_OUT
                         : COLOR_DIM;

      const side = DIR_TO_SIDE[dir];
      const geo = side.axis === 'x' ? bundleGeoX : bundleGeoZ;
      const material = new THREE.MeshBasicMaterial({
        color: baseColorHex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, material);

      // sit just outside the facade surface
      const off = BUNDLE_T / 2 + 0.02;
      if (side.axis === 'x') {
        mesh.position.set(side.sign * (SLAB_W / 2 + off), y, 0);
      } else {
        mesh.position.set(0, y, side.sign * (SLAB_D / 2 + off));
      }
      // mild size scaling by total so bigger bundles read as bigger
      const baseScale = 1 + Math.min(total, 12) * 0.04;
      mesh.scale.setScalar(baseScale);
      mesh.userData.bundleKey = `${floorNo}:${dir}`;
      scene.add(mesh);
      bundleMeshes.push(mesh);

      // CSS2D count badge: `↑N ↓M`. Hover class adds a directional label
      // prefix (`东 · 3F ...`) via CSS ::before from data-label.
      const badgeEl = document.createElement('div');
      badgeEl.className = 'b3d-badge';
      badgeEl.dataset.label = `${DIR_ZH[dir]} · ${floorLabel}`;
      const up = document.createElement('span');
      up.className = 'b3d-badge__in';
      up.textContent = `↑${inN}`;
      const dn = document.createElement('span');
      dn.className = 'b3d-badge__out';
      dn.textContent = `↓${outN}`;
      badgeEl.append(up, dn);

      const badge = new CSS2DObject(badgeEl);
      const bx = side.axis === 'x' ? side.sign * (SLAB_W / 2 + off + 0.06) : 0;
      const bz = side.axis === 'z' ? side.sign * (SLAB_D / 2 + off + 0.06) : 0;
      badge.position.set(bx, y + BUNDLE_H / 2 + 0.1, bz);
      scene.add(badge);

      bundles.push({
        floorNo, dir, inN, outN, total, dominant,
        mesh, material, badge, badgeEl,
      });
    }
  }

  // --- emphasis state ---
  let activeFloorNo = null;
  let activeDirection = null;

  function findSlab(fn) { return slabs.find((s) => s.floorNo === fn) || null; }

  function applyHighlight() {
    // Slab colors
    for (const s of slabs) {
      const isActive = s.floorNo === activeFloorNo;
      s.lineSeg.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.opacity = isActive ? 0.18 : 0.06;
    }

    // Facade wash plane (subtle, only on active floor + selected direction)
    if (activeFloorNo == null || activeDirection == null) {
      facade.visible = false;
    } else {
      const s = findSlab(activeFloorNo);
      const side = DIR_TO_SIDE[activeDirection];
      if (!s || !side) {
        facade.visible = false;
      } else {
        facade.visible = true;
        if (side.axis === 'x') {
          facade.geometry = facadeGeoX;
          facade.position.set(side.sign * (SLAB_W / 2 + 0.015), s.y, 0);
          facade.rotation.set(0, side.sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        } else {
          facade.geometry = facadeGeoZ;
          facade.position.set(0, s.y, side.sign * (SLAB_D / 2 + 0.015));
          facade.rotation.set(0, side.sign > 0 ? 0 : Math.PI, 0);
        }
      }
    }

    // Bundles: emphasize if on the active floor OR the selected direction.
    // Dim others so the active layer + selected facade read clearly.
    for (const b of bundles) {
      const onActiveFloor = b.floorNo === activeFloorNo;
      const onSelectedDir = activeDirection != null && b.dir === activeDirection;
      const emphasis = onActiveFloor || onSelectedDir;

      b.material.opacity = emphasis ? 0.95 : 0.4;
      const baseScale = 1 + Math.min(b.total, 12) * 0.04;
      b.mesh.scale.setScalar(baseScale * (emphasis ? 1.12 : 0.9));

      b.badgeEl.classList.toggle('is-dim', !emphasis);
    }
  }

  function setActiveFloor(floorNo) {
    activeFloorNo = floorNo;
    applyHighlight();
  }
  function setActiveDirection(dir) {
    activeDirection = dir == null ? null : (DIR_TO_SIDE[dir] ? dir : null);
    applyHighlight();
  }

  // --- sizing (decoupled from layout, see styles.css .b3d-mount canvas) ---
  function getSize() {
    return { w: container.clientWidth || 1, h: container.clientHeight || 1 };
  }
  // CSS governs the canvas's DISPLAY size (no style write from Three).
  // setSize(false) only sets the drawing buffer. lastW/lastH breaks any
  // residual ResizeObserver loop.
  let lastW = 0, lastH = 0;
  function resize() {
    const { w, h } = getSize();
    if (w < 2 || h < 2) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    // cssRenderer.setSize writes style.width/height in px as a side effect;
    // we need it ONLY for the _width/_height projection math (badges'
    // screen-space positions are derived from these). So call it, then
    // immediately clear the inline width/height so CSS (.b3d-overlay
    // { inset:0 }) fully owns the overlay's display dimensions. This
    // removes the only remaining "style on a child of the observed
    // container" write from the resize path.
    cssRenderer.setSize(w, h);
    cssRenderer.domElement.style.width = '';
    cssRenderer.domElement.style.height = '';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  // --- pointer: click bundles / slabs; hover bundles for label ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const slabMeshes = slabs.map((s) => s.fill);

  let downPos = null;
  let downT = 0;
  let hoveredBundle = null;

  function setPointerNDC(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function bundleAtPointer() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(bundleMeshes, false);
    if (!hits.length) return null;
    const key = hits[0].object.userData.bundleKey;
    return bundles.find((b) => `${b.floorNo}:${b.dir}` === key) || null;
  }
  function slabAtPointer() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(slabMeshes, false);
    return hits.length ? hits[0].object : null;
  }

  function setHovered(b) {
    if (hoveredBundle === b) return;
    if (hoveredBundle) hoveredBundle.badgeEl.classList.remove('is-hover');
    hoveredBundle = b;
    if (b) b.badgeEl.classList.add('is-hover');
  }

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    downPos = { x: ev.clientX, y: ev.clientY };
    downT = ev.timeStamp;
  });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downPos) return;
    const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
    const dt = ev.timeStamp - downT;
    downPos = null;
    // dragging (orbit) -> ignore the click
    if (moved > 5 || dt > 500) return;
    setPointerNDC(ev);
    // bundles take precedence: clicking a marker must NOT also fire a slab jump
    const b = bundleAtPointer();
    if (b) {
      if (onSelectBundle) onSelectBundle(b.floorNo, b.dir);
      return;
    }
    if (!onSelectFloor) return;
    const mesh = slabAtPointer();
    const fn = mesh ? mesh.userData.floorNo : null;
    if (fn != null) onSelectFloor(fn);
  });
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (downPos) return; // orbiting
    setPointerNDC(ev);
    const b = bundleAtPointer();
    setHovered(b);
    const overBundle = !!b;
    const overSlab = !overBundle && !!onSelectFloor && !!slabAtPointer();
    renderer.domElement.style.cursor = (overBundle || overSlab) ? 'pointer' : '';
  });

  // --- render loop (static scene; no auto-rotate, no animations) ---
  let rafId = 0;
  function render() {
    controls.update();
    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);
    rafId = requestAnimationFrame(render);
  }
  render();
  applyHighlight();

  // --- cleanup ---
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    window.removeEventListener('resize', resize);
    controls.dispose();

    for (const s of slabs) {
      s.lineSeg.geometry.dispose();
      s.lineSeg.material.dispose();
      s.fill.geometry.dispose();
      s.fill.material.dispose();
    }
    facadeGeoX.dispose();
    facadeGeoZ.dispose();
    facadeMat.dispose();

    bundleGeoX.dispose();
    bundleGeoZ.dispose();
    for (const b of bundles) b.material.dispose();

    grid.geometry.dispose();
    grid.material.dispose();

    // CSS2D badge DOM elements live under cssRenderer.domElement; removing
    // the overlay from the container takes them all out of the tree.
    if (cssRenderer.domElement.parentNode === container) {
      container.removeChild(cssRenderer.domElement);
    }
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { setActiveFloor, setActiveDirection, dispose };
}