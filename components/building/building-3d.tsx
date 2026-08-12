'use client';

// Minimal Three.js building wireframe anchor WITH per-floor per-facade
// BUNDLE MARKERS (one marker per floor x facade direction, no individual
// cables drawn in 3D). Plus per-floor EQUIPMENT DOTS (small colored cubes
// on the active floor).
//
// Faithful port of js/building3d.js for the Next.js rewrite:
//   - Footprint extrusion (THREE.Shape + ExtrudeGeometry) when the building
//     has a custom polygon; otherwise a BoxGeometry placeholder.
//   - Equipment dots on the active floor only (rebuilt on setActiveFloor).
//   - One bundle marker per (floorNo, direction) with in/out tallies.
//   - CSS2D count badges, direction labels (东/南/西/北), floor labels.
//   - Raycaster: clicking a bundle jumps to its floor + direction; clicking
//     a slab jumps to that floor. Hover swaps cursor.
//   - ResizeObserver + window resize + dispose cleanup.
//
// RED LINE: NO individual cables are drawn in 3D. The scene shows:
//   - a stack of floor slabs (thin wireframe boxes / extruded footprint),
//   - ONE bundle marker per floor x per facade direction,
//   - colored dots on the active floor for each equipment item.
//
// The Three.js scene is mounted into a plain <div ref={mountRef}> container.
// The container MUST be `position: relative` (.b3d-mount in globals.css)
// so the CSS2D overlay can sit over it via `inset: 0`.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import type { Building, Equipment, Direction } from '@/lib/types';

// --- canonical direction order + Chinese label (kept local to avoid coupling) ---
const DIRS: Direction[] = ['Dong', 'Nan', 'Xi', 'Bei'];
const DIR_ZH: Record<Direction, string> = {
  Dong: '东',
  Nan: '南',
  Xi: '西',
  Bei: '北',
};

const DIR_TO_SIDE: Record<Direction, { axis: 'x' | 'z'; sign: 1 | -1 }> = {
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

// Equipment type -> dot color (small cubes on the active floor).
const EQUIPMENT_COLOR: Record<string, number> = {
  '一级配电箱': 0x1f8a55, // green
  '二级配电箱': 0x2b6cb0, // blue
  'OTN':       0xd4a017, // yellow
  '光交':      0x7c4dff, // purple
};
const DOT_SIZE = 0.18;

// Slab proportions (abstract; the scene is a spatial anchor, not to scale).
const SLAB_W = 4.0;
const SLAB_D = 4.0;
const SLAB_H = 1.0;
const FLOOR_GAP = 0.2;
const FLOOR_STEP = SLAB_H + FLOOR_GAP;

// Bundle marker footprint (one per floor x facade).
const BUNDLE_W = 0.42;
const BUNDLE_H = 0.42;
const BUNDLE_T = 0.14;

export interface InitBuilding3DOptions {
  onSelectFloor?: (floorNo: number) => void;
  onSelectBundle?: (floorNo: number, dir: Direction) => void;
  onSelectEquipment?: (equipment: Equipment) => void;
}

export interface Building3DHandle {
  setActiveFloor: (floorNo: number | null) => void;
  setActiveDirection: (dir: Direction | null) => void;
  dispose: () => void;
}

/**
 * Mount a Three.js building scene into `container`.
 *
 * `container` is expected to be `position: relative` (CSS class `.b3d-mount`)
 * with explicit width/height. The function returns a handle with
 * setActiveFloor / setActiveDirection / dispose and (optionally) calls
 * `opts.onSelectFloor` / `opts.onSelectBundle` on user clicks.
 */
export function initBuilding3D(
  container: HTMLElement,
  building: Building,
  opts: InitBuilding3DOptions = {},
): Building3DHandle {
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
  // overlay's layout — we never write inline position/size/pointer-events.
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

  // --- building wireframe: one slab (edges + faint fill) per floor, stacked ---
  let slabGeo: THREE.BufferGeometry;
  let slabEdgesGeo: THREE.EdgesGeometry;
  if (building.footprint) {
    const shape = new THREE.Shape();
    const fp = building.footprint;
    shape.moveTo(fp[0][0], fp[0][1]);
    for (let i = 1; i < fp.length; i += 1) {
      shape.lineTo(fp[i][0], fp[i][1]);
    }
    slabGeo = new THREE.ExtrudeGeometry(shape, { depth: SLAB_H, bevelEnabled: false });
    // ExtrudeGeometry builds on the XY plane and extrudes along +Z. Rotate
    // so the polygon lies on XZ (Y up): shape (x, y) -> world (x, -z),
    // extrusion direction (Z) -> world Y.
    slabGeo.rotateX(-Math.PI / 2);
    // Shift so the slab's center sits at y=0 in geometry-local space.
    slabGeo.translate(0, -SLAB_H / 2, 0);
  } else {
    slabGeo = new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_D);
  }
  slabEdgesGeo = new THREE.EdgesGeometry(slabGeo);

  interface SlabEntry {
    floorNo: number;
    y: number;
    lineSeg: THREE.LineSegments;
    fill: THREE.Mesh;
    lineMat: THREE.LineBasicMaterial;
    fillMat: THREE.MeshBasicMaterial;
  }
  const slabs: SlabEntry[] = [];
  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo;
    const y = i * FLOOR_STEP + SLAB_H / 2;

    const lineMat = new THREE.LineBasicMaterial({ color: COLOR_DIM });
    const lineSeg = new THREE.LineSegments(slabEdgesGeo, lineMat);
    lineSeg.position.set(0, y, 0);

    const fillMat = new THREE.MeshBasicMaterial({
      color: COLOR_DIM,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(slabGeo, fillMat);
    fill.position.set(0, y, 0);
    fill.userData.floorNo = floorNo;

    scene.add(lineSeg, fill);
    slabs.push({ floorNo, y, lineSeg, fill, lineMat, fillMat });
  }

  // --- equipment dots (current floor only) ---
  interface EquipDot {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    geometry: THREE.BoxGeometry;
  }
  let equipDots: EquipDot[] = [];
  function clearEquipDots() {
    for (const d of equipDots) {
      scene.remove(d.mesh);
      d.geometry.dispose();
      d.material.dispose();
    }
    equipDots = [];
  }
  function renderEquipDotsForFloor(floorNo: number | null) {
    clearEquipDots();
    if (!Array.isArray(building.equipment) || floorNo == null) return;
    const items = building.equipment.filter((e) => e.floorNo === floorNo);
    if (items.length === 0) return;
    // Sit just above the slab's top surface.
    const dotY = (floorNo - 1) * FLOOR_STEP + SLAB_H + DOT_SIZE / 2 + 0.02;
    for (const e of items) {
      const colorHex = EQUIPMENT_COLOR[e.type] != null
        ? EQUIPMENT_COLOR[e.type]
        : COLOR_DIM;
      const opacity = e.status === 'online' ? 0.95 : 0.45;
      const geo = new THREE.BoxGeometry(DOT_SIZE, DOT_SIZE, DOT_SIZE);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Local [0, 1] -> world; 0.8 inset factor keeps dots inside the slab.
      const worldX = (e.position.x - 0.5) * SLAB_W * 0.8;
      const worldZ = (e.position.y - 0.5) * SLAB_D * 0.8;
      mesh.position.set(worldX, dotY, worldZ);
      scene.add(mesh);
      equipDots.push({ mesh, material: mat, geometry: geo });
    }
  }

  // Subtle ground grid as a spatial anchor.
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
  const bundleGeoX = new THREE.BoxGeometry(BUNDLE_T, BUNDLE_H, BUNDLE_W);
  const bundleGeoZ = new THREE.BoxGeometry(BUNDLE_W, BUNDLE_H, BUNDLE_T);

  interface BundleEntry {
    floorNo: number;
    dir: Direction;
    inN: number;
    outN: number;
    total: number;
    dominant: 'in' | 'out' | 'eq';
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    badge: CSS2DObject;
    badgeEl: HTMLDivElement;
  }
  const bundles: BundleEntry[] = [];
  const bundleMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo;
    const y = i * FLOOR_STEP + SLAB_H / 2;
    const floorLabel = floors[i].label || `${floorNo}F`;

    // tally this floor's cables per direction
    const tally: Record<Direction, { in: number; out: number }> = {
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
      const dominant: 'in' | 'out' | 'eq' =
        inN > outN ? 'in' : (outN > inN ? 'out' : 'eq');
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

      const off = BUNDLE_T / 2 + 0.02;
      if (side.axis === 'x') {
        mesh.position.set(side.sign * (SLAB_W / 2 + off), y, 0);
      } else {
        mesh.position.set(0, y, side.sign * (SLAB_D / 2 + off));
      }
      const baseScale = 1 + Math.min(total, 12) * 0.04;
      mesh.scale.setScalar(baseScale);
      mesh.userData.bundleKey = `${floorNo}:${dir}`;
      scene.add(mesh);
      bundleMeshes.push(mesh);

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

  // --- direction labels (东/南/西/北): one CSS2D label per facade ---
  const DIR_LABEL_OFFSET = 0.7;
  interface DirLabel {
    dir: Direction;
    el: HTMLDivElement;
  }
  function makeDirLabel(dir: Direction, x: number, y: number, z: number): DirLabel {
    const el = document.createElement('div');
    el.className = 'b3d-dir-label';
    el.textContent = DIR_ZH[dir];
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    scene.add(obj);
    return { dir, el };
  }
  const dirLabels: DirLabel[] = [
    makeDirLabel('Dong',  (SLAB_W / 2 + DIR_LABEL_OFFSET), buildingH / 2, 0),
    makeDirLabel('Xi',   -(SLAB_W / 2 + DIR_LABEL_OFFSET), buildingH / 2, 0),
    makeDirLabel('Nan',   0, buildingH / 2,  (SLAB_D / 2 + DIR_LABEL_OFFSET)),
    makeDirLabel('Bei',   0, buildingH / 2, -(SLAB_D / 2 + DIR_LABEL_OFFSET)),
  ];

  // --- floor labels: one CSS2D label per slab at the front-right corner ---
  const FLOOR_LABEL_OFFSET_X = SLAB_W / 2 + 0.3;
  const FLOOR_LABEL_OFFSET_Z = SLAB_D / 2 + 0.3;
  interface FloorLabel {
    floorNo: number;
    el: HTMLDivElement;
  }
  const floorLabels: FloorLabel[] = [];
  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo;
    const y = i * FLOOR_STEP + SLAB_H / 2;
    const el = document.createElement('div');
    el.className = 'b3d-floor-label';
    el.textContent = floors[i].label || `${floorNo}F`;
    const obj = new CSS2DObject(el);
    obj.position.set(FLOOR_LABEL_OFFSET_X, y, FLOOR_LABEL_OFFSET_Z);
    scene.add(obj);
    floorLabels.push({ floorNo, el });
  }

  // --- emphasis state ---
  let activeFloorNo: number | null = null;
  let activeDirection: Direction | null = null;

  function findSlab(fn: number): SlabEntry | null {
    return slabs.find((s) => s.floorNo === fn) || null;
  }

  function applyHighlight() {
    for (const s of slabs) {
      const isActive = s.floorNo === activeFloorNo;
      s.lineSeg.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.opacity = isActive ? 0.18 : 0.06;
    }

    if (activeFloorNo == null || activeDirection == null) {
      facade.visible = false;
    } else {
      const s = findSlab(activeFloorNo);
      const side = activeDirection ? DIR_TO_SIDE[activeDirection] : null;
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

    for (const b of bundles) {
      const onActiveFloor = b.floorNo === activeFloorNo;
      const onSelectedDir = activeDirection != null && b.dir === activeDirection;
      const emphasis = onActiveFloor || onSelectedDir;

      b.material.opacity = emphasis ? 0.95 : 0.4;
      const baseScale = 1 + Math.min(b.total, 12) * 0.04;
      b.mesh.scale.setScalar(baseScale * (emphasis ? 1.12 : 0.9));

      b.badgeEl.classList.toggle('is-dim', !emphasis);
    }

    for (const fl of floorLabels) {
      fl.el.classList.toggle('is-active', fl.floorNo === activeFloorNo);
    }
  }

  function setActiveFloor(floorNo: number | null) {
    activeFloorNo = floorNo;
    applyHighlight();
    renderEquipDotsForFloor(floorNo);
  }
  function setActiveDirection(dir: Direction | null) {
    activeDirection = dir == null ? null : (DIR_TO_SIDE[dir] ? dir : null);
    applyHighlight();
  }

  // --- sizing (decoupled from layout, see globals.css .b3d-mount canvas) ---
  function getSize() {
    return { w: container.clientWidth || 1, h: container.clientHeight || 1 };
  }
  let lastW = 0, lastH = 0;
  function resize() {
    const { w, h } = getSize();
    if (w < 2 || h < 2) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
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

  let downPos: { x: number; y: number } | null = null;
  let downT = 0;
  let hoveredBundle: BundleEntry | null = null;

  function setPointerNDC(ev: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function bundleAtPointer(): BundleEntry | null {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(bundleMeshes, false);
    if (!hits.length) return null;
    const key = hits[0].object.userData.bundleKey as string | undefined;
    if (!key) return null;
    return bundles.find((b) => `${b.floorNo}:${b.dir}` === key) || null;
  }
  function slabAtPointer(): THREE.Mesh | null {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(slabMeshes, false);
    return hits.length ? (hits[0].object as THREE.Mesh) : null;
  }

  function setHovered(b: BundleEntry | null) {
    if (hoveredBundle === b) return;
    if (hoveredBundle) hoveredBundle.badgeEl.classList.remove('is-hover');
    hoveredBundle = b;
    if (b) b.badgeEl.classList.add('is-hover');
  }

  function onPointerDown(ev: PointerEvent) {
    downPos = { x: ev.clientX, y: ev.clientY };
    downT = ev.timeStamp;
  }
  function onPointerUp(ev: PointerEvent) {
    if (!downPos) return;
    const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y);
    const dt = ev.timeStamp - downT;
    downPos = null;
    if (moved > 5 || dt > 500) return;
    setPointerNDC(ev);
    const b = bundleAtPointer();
    if (b) {
      if (onSelectBundle) onSelectBundle(b.floorNo, b.dir);
      return;
    }
    if (!onSelectFloor) return;
    const mesh = slabAtPointer();
    const fn = mesh ? (mesh.userData.floorNo as number | undefined) : null;
    if (fn != null) onSelectFloor(fn);
  }
  function onPointerMove(ev: PointerEvent) {
    if (downPos) return;
    setPointerNDC(ev);
    const b = bundleAtPointer();
    setHovered(b);
    const overBundle = !!b;
    const overSlab = !overBundle && !!onSelectFloor && !!slabAtPointer();
    renderer.domElement.style.cursor = (overBundle || overSlab) ? 'pointer' : '';
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);

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

    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);

    controls.dispose();

    clearEquipDots();
    for (const s of slabs) {
      s.lineSeg.material.dispose();
      s.fill.material.dispose();
    }
    slabEdgesGeo.dispose();
    slabGeo.dispose();
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
