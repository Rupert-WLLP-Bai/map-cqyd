// js/building3d.js
//
// Minimal Three.js building WIREFRAME anchor.
//
// Exposes:  initBuilding3D(container, building) -> {
//             setActiveFloor(floorNo),
//             setActiveDirection(dir | null),
//             dispose()
//           }
//
// RED LINE: NO cables are ever drawn in 3D. The scene is ONLY a building
// wireframe: a stack of floor slabs (thin edges). It highlights the active
// floor's slab and the selected facade direction on that slab. The viewer
// can drag to rotate. No auto-rotate, no flythrough, no glow/particles/
// animation gimmicks.
//
// Direction -> facade mapping (consistent, per project contract):
//   东 Dong = +X     西 Xi = -X     南 Nan = +Z     北 Bei = -Z
//
// `three` is imported via the bare specifier resolved by the import map in
// index.html (no npm, no build step). OrbitControls is imported from the
// CDN ESM URL; its own internal `import * as THREE from 'three'` resolves
// through the same import map.

import * as THREE from 'three';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// Direction name -> which axis side the facade lives on.
const DIR_TO_SIDE = {
  Dong: { axis: 'x', sign: +1 }, // 东  = +X
  Xi:   { axis: 'x', sign: -1 }, // 西  = -X
  Nan:  { axis: 'z', sign: +1 }, // 南  = +Z
  Bei:  { axis: 'z', sign: -1 }, // 北  = -Z
};

const COLOR_DIM     = 0x9aa3b3; // neutral gray for inactive floors
const COLOR_ACTIVE  = 0x2f6df6; // blue for the active floor
const COLOR_FACADE  = 0xff5a5f; // coral for the highlighted facade
const COLOR_BG      = 0xf4f5f7; // light neutral backdrop
const COLOR_GRID_MJ = 0xcfd3da;
const COLOR_GRID_MN = 0xe8eaee;

// Slab proportions (abstract units; the scene is a spatial anchor, not to scale).
const SLAB_W   = 4.0;  // X width
const SLAB_D   = 4.0;  // Z depth
const SLAB_H   = 1.0;  // Y height of one floor slab
const FLOOR_GAP = 0.2;  // vertical gap between slabs
const FLOOR_STEP = SLAB_H + FLOOR_GAP;

export function initBuilding3D(container, building) {
  if (!container) throw new Error('initBuilding3D: container is required');
  if (!building || !Array.isArray(building.floors) || building.floors.length === 0) {
    throw new Error('initBuilding3D: building with floors is required');
  }

  const floors = building.floors;
  const floorCount = floors.length;
  const buildingH = floorCount * FLOOR_STEP;

  // --- scene / camera / renderer ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BG);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  const dist = Math.max(11, buildingH * 1.7);
  camera.position.set(dist * 0.72, buildingH * 0.85 + 2.5, dist * 0.92);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';

  // --- controls: drag to rotate only. No auto-rotate, no pan, no flythrough. ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.minDistance = 7;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49; // keep viewer above ground
  controls.target.set(0, buildingH / 2, 0);
  controls.update();

  // --- building wireframe: one box (edges + faint fill) per floor, stacked ---
  const slabGroup = new THREE.Group();
  scene.add(slabGroup);

  const slabs = []; // { floorNo, y, lineSeg, fill }

  for (let i = 0; i < floorCount; i += 1) {
    const floorNo = floors[i].floorNo; // 1-based per data contract
    const y = i * FLOOR_STEP + SLAB_H / 2;

    const boxGeo = new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_D);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    const lineMat = new THREE.LineBasicMaterial({ color: COLOR_DIM });
    const lineSeg = new THREE.LineSegments(edgesGeo, lineMat);
    lineSeg.position.set(0, y, 0);

    // A faint translucent fill so the active floor reads as a solid slab
    // when highlighted, without adding any glow / animation.
    const fillMat = new THREE.MeshBasicMaterial({
      color: COLOR_DIM,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(boxGeo, fillMat);
    fill.position.set(0, y, 0);

    slabGroup.add(lineSeg);
    slabGroup.add(fill);
    slabs.push({ floorNo, y, lineSeg, fill });
  }

  // Subtle ground grid as a spatial anchor (nothing flashy).
  const grid = new THREE.GridHelper(24, 24, COLOR_GRID_MJ, COLOR_GRID_MN);
  grid.position.y = -0.001;
  scene.add(grid);

  // --- facade highlight: one reusable translucent plane on the active floor ---
  // X-side facades (+X/-X) span Z x H; Z-side facades (+Z/-Z) span X x H.
  const facadeGeoX = new THREE.PlaneGeometry(SLAB_D, SLAB_H);
  const facadeGeoZ = new THREE.PlaneGeometry(SLAB_W, SLAB_H);
  const facadeMat = new THREE.MeshBasicMaterial({
    color: COLOR_FACADE,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const facade = new THREE.Mesh(facadeGeoX, facadeMat);
  facade.visible = false;
  scene.add(facade);

  let activeFloorNo = null;
  let activeDirection = null;

  function findSlab(fn) {
    return slabs.find(s => s.floorNo === fn) || null;
  }

  function applyHighlight() {
    // Floor slab highlight: active floor bright, others dim.
    for (const s of slabs) {
      const isActive = s.floorNo === activeFloorNo;
      s.lineSeg.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.color.setHex(isActive ? COLOR_ACTIVE : COLOR_DIM);
      s.fill.material.opacity = isActive ? 0.18 : 0.06;
    }

    // Facade highlight: only on the active floor, on the selected side.
    if (activeFloorNo == null || activeDirection == null) {
      facade.visible = false;
      return;
    }
    const s = findSlab(activeFloorNo);
    const side = DIR_TO_SIDE[activeDirection];
    if (!s || !side) {
      facade.visible = false;
      return;
    }
    facade.visible = true;
    if (side.axis === 'x') {
      facade.geometry = facadeGeoX;
      facade.position.set(side.sign * (SLAB_W / 2 + 0.015), s.y, 0);
      // Plane faces +Z by default; rotate so it faces +/-X.
      facade.rotation.set(0, side.sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    } else {
      facade.geometry = facadeGeoZ;
      facade.position.set(0, s.y, side.sign * (SLAB_D / 2 + 0.015));
      facade.rotation.set(0, side.sign > 0 ? 0 : Math.PI, 0);
    }
  }

  function setActiveFloor(floorNo) {
    activeFloorNo = floorNo;
    applyHighlight();
  }

  function setActiveDirection(dir) {
    // dir: 'Dong' | 'Nan' | 'Xi' | 'Bei' | null
    activeDirection = dir == null ? null : DIR_TO_SIDE[dir] ? dir : null;
    applyHighlight();
  }

  // --- sizing ---
  function getSize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    return { w, h };
  }

  // CSS (.b3d-mount canvas { width:100%; height:100% }) governs the canvas's
  // DISPLAY size so it always fits the container (no 2x overflow on Retina,
  // no layout feedback). setSize(false) only sets the drawing buffer to
  // w*pixelRatio x h*pixelRatio for crisp rendering — it must NOT write
  // canvas.style, or it feeds back into the layout and oscillates the whole
  // .bld-body (left panel flickers). lastW/lastH guard skips no-op resizes
  // and breaks any residual ResizeObserver loop.
  let lastW = 0, lastH = 0;
  function resize() {
    const { w, h } = getSize();
    if (w < 2 || h < 2) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  // ResizeObserver covers the container becoming visible after view switch.
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  // --- render loop (static scene; no auto-rotate, no animations) ---
  let rafId = 0;
  function render() {
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(render);
  }
  render();

  // Apply defaults: nothing highlighted until app.js drives it.
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
    grid.geometry.dispose();
    grid.material.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  }

  return { setActiveFloor, setActiveDirection, dispose };
}
