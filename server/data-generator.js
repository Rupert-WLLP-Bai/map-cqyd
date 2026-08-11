// server/data-generator.js
//
// Mock dataset for the map-cqyd v2 demo. Generates ~1000 buildings in the
// 两江新区 (Liangjiang New Area) bbox at boot and caches the result in
// memory. No DB; the seed is fixed so output is stable across restarts.
//
// Shape:
//   Building = { id, name, lng, lat, address, floors: Floor[] }
//   Floor    = { floorNo, label, cables: Cable[] }
//   Cable    = { id, name, direction: 'Dong'|'Nan'|'Xi'|'Bei',
//                io: 'in'|'out', peer, type, cores }
//
// Distribution:
//   - ~70% of buildings from 6 CBD Gaussian clusters (CBD centers from spec).
//   - ~30% from 6 main-street corridors (along-track + perpendicular Gaussian).
//   - 4-8 floors per building (uniform).
//   - Per-floor cable count is sampled from a log-normal distribution with a
//     heavy tail up to 200 (for "equipment room" floors). Parameters are
//     tuned so the total cable count lands in the 9000-11000 range required
//     by the smoke test.
//
// All rng is mulberry32 with a fixed seed → reproducible data.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { mulberry32 } from './lib/rng.js';
import { generateRoomsAndEquipment } from './data/equipment-generator.js';

// Load hand-curated footprints (v3). The data file is plain JSON keyed by
// building ID, holding a `polygon` of local 2D coords. We assert the file
// exists at module load so a missing/corrupt data file fails fast at boot
// rather than silently leaving every footprint as null.
const HERE = dirname(fileURLToPath(import.meta.url));
const FOOTPRINTS_PATH = join(HERE, 'data', 'footprints.json');
const footprints = JSON.parse(readFileSync(FOOTPRINTS_PATH, 'utf8'));

// ----- constants -----------------------------------------------------------

const SEED = 0xC4BE11; // arbitrary fixed seed — deterministic data
const TARGET_BUILDINGS = 1000;
const TOTAL_BUILDING_BUDGET = TARGET_BUILDINGS;
const CBD_BUDGET = Math.round(TOTAL_BUILDING_BUDGET * 0.7);
const STREET_BUDGET = TOTAL_BUILDING_BUDGET - CBD_BUDGET;

// 两江新区 (Liangjiang New Area) bounding box (spec).
const BBOX = {
  minLng: 106.48,
  maxLng: 106.72,
  minLat: 29.52,
  maxLat: 29.74,
};

// 6 CBD centers + 2D Gaussian sigma (degrees, ~1-1.5 km radius). Verbatim
// from the v2 design spec.
const CBD_CLUSTERS = [
  { name: '江北嘴',   lng: 106.583, lat: 29.575, sigma: 0.012 },
  { name: '光电园',   lng: 106.518, lat: 29.605, sigma: 0.014 },
  { name: '幸福广场', lng: 106.535, lat: 29.585, sigma: 0.010 },
  { name: '观音桥',   lng: 106.575, lat: 29.585, sigma: 0.013 },
  { name: '龙兴',     lng: 106.665, lat: 29.690, sigma: 0.018 },
  { name: '汽博',     lng: 106.555, lat: 29.620, sigma: 0.011 },
];

// 6 main-street corridors. Each is a line segment in bbox-local coordinates;
// buildings are scattered along it with a 1D Gaussian (along-track) +
// perpendicular 2D Gaussian (sigma ~ 50-100 m equivalent in degrees).
const STREET_CORRIDORS = [
  { name: '金渝大道', startLng: 106.49, startLat: 29.62, endLng: 106.58, endLat: 29.62 },
  { name: '金开大道', startLng: 106.55, startLat: 29.55, endLng: 106.66, endLat: 29.70 },
  { name: '渝澳大道', startLng: 106.57, startLat: 29.59, endLng: 106.59, endLat: 29.55 },
  { name: '北滨一路', startLng: 106.48, startLat: 29.58, endLng: 106.60, endLat: 29.58 },
  { name: '机场路',   startLng: 106.48, startLat: 29.55, endLng: 106.48, endLat: 29.65 },
  { name: '龙驿大道', startLng: 106.60, startLat: 29.62, endLng: 106.72, endLat: 29.65 },
];
const PERP_SIGMA = 0.0008;   // ~90 m in latitude
const ALONG_MU = 0.5;        // Gaussian around midpoint
const ALONG_SIGMA = 0.25;    // along-track spread

// Floors per building: uniform 4-8.
const FLOOR_MIN = 4;
const FLOOR_MAX = 8;

// Log-normal per-floor cable count.
//   mean = exp(MU + SIGMA^2 / 2)
// With MU=-0.85, SIGMA=1.5 → theoretical mean ≈ 1.32. After clamping to
// [1, 200] the truncated mean lands around 1.6-1.8. With ~1000 buildings ×
// ~6 floors ≈ 6000 floors × 1.7 ≈ 10200 — inside the smoke range
// (9000-11000). The heavy tail (99.9th percentile ≈ exp(-0.85 + 3.09·1.5)
// ≈ 36) still produces the spec's "long tail of equipment rooms reaching
// 50-200" via cap at 200.
const FLOOR_CABLE_MU = -0.85;
const FLOOR_CABLE_SIGMA = 1.5;
const FLOOR_CABLE_MIN = 1;
const FLOOR_CABLE_MAX = 200;

const DIRECTIONS = ['Dong', 'Nan', 'Xi', 'Bei'];

const ROAD_WORDS = [
  '渝北大道', '金开大道', '龙华大道', '嘉鸿大道',
  '兴盛大道', '宝华路', '渝鲁路', '龙塔路',
  '兴隆路', '民安路', '双龙大道', '金渝大道',
];
const PARK_WORDS = [
  '中央公园', '龙头寺公园', '鸿恩寺公园', '鹅岭公园',
  '平顶山公园', '华岩寺', '观音桥商圈', '江北嘴商圈',
];

const PEERS = [
  '联通核心网', '电信城域网', '移动传输网', '广电接入网',
  'B栋机房', 'C栋接入间', '地下进线间', '楼顶基站',
  '综合布线间', '配线架A', '配线架B', '汇聚交换机',
];
const TYPES = ['光缆', '网线', '电缆', '同轴电缆', '尾纤'];
const CORES = [12, 24, 48, 96, 8, 16, 144, 4];

// ----- helpers -------------------------------------------------------------

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Standard Normal sample via Box-Muller.
function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function inBbox(lng, lat) {
  return (
    lng >= BBOX.minLng && lng <= BBOX.maxLng &&
    lat >= BBOX.minLat && lat <= BBOX.maxLat
  );
}

// Sample one CBD building (Gaussian around cluster center). May fall outside
// the bbox — caller rejects and re-samples.
function sampleCbdBuilding(rng, cluster) {
  const lng = cluster.lng + gaussian(rng) * cluster.sigma;
  const lat = cluster.lat + gaussian(rng) * cluster.sigma;
  return { lng, lat };
}

// Sample one corridor building along a line segment.
function sampleStreetBuilding(rng, corridor) {
  const dx = corridor.endLng - corridor.startLng;
  const dy = corridor.endLat - corridor.startLat;
  // Perpendicular unit vector (rotated 90° in lng-lat plane).
  const len = Math.sqrt(dx * dx + dy * dy) || 1e-9;
  const px = -dy / len;
  const py = dx / len;

  // Along-track parameter t ~ N(mu, sigma), clamped to [0,1].
  let t = ALONG_MU + gaussian(rng) * ALONG_SIGMA;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  // Perpendicular offset in degrees.
  const perp = gaussian(rng) * PERP_SIGMA;

  const lng = corridor.startLng + dx * t + px * perp;
  const lat = corridor.startLat + dy * t + py * perp;
  return { lng, lat };
}

// Number of floors for this building — uniform in [FLOOR_MIN, FLOOR_MAX].
function sampleFloorCount(rng) {
  return FLOOR_MIN + Math.floor(rng() * (FLOOR_MAX - FLOOR_MIN + 1));
}

// Log-normal sample, clamped to [min, max]. Always >= min (smoke requires
// every floor to have at least one cable). With SIGMA=1.5 the tail reaches
// up to 200 (the "equipment room" floors).
function sampleFloorCableCount(rng) {
  let n = Math.exp(FLOOR_CABLE_MU + gaussian(rng) * FLOOR_CABLE_SIGMA);
  n = Math.round(n);
  if (n < FLOOR_CABLE_MIN) n = FLOOR_CABLE_MIN;
  if (n > FLOOR_CABLE_MAX) n = FLOOR_CABLE_MAX;
  return n;
}

// Build the cables for one floor. `count` is the total number of cables on
// this floor; they're distributed across the four directions (no direction
// guarantee — most floors are small and only hit 1-2 directions). The
// building prefix in the cable id keeps it unique across the whole set.
function genCables(buildingId, floorNo, count) {
  const rng = mulberry32(
    hashStr(buildingId) * 977 + floorNo * 31 + 7
  );
  const cables = [];
  for (let i = 0; i < count; i += 1) {
    const dir = DIRECTIONS[Math.floor(rng() * 4)];
    const io = rng() < 0.5 ? 'in' : 'out';
    const type = pick(rng, TYPES);
    const cores = pick(rng, CORES);
    const peer = pick(rng, PEERS);
    const seq = i + 1;
    const num = String(seq).padStart(3, '0');
    cables.push({
      id: `${buildingId}-F${floorNo}-${dir}-${num}`,
      name: `${dir}-${floorNo}F-${type}-${num}`,
      direction: dir,
      io,
      peer,
      type,
      cores,
    });
  }
  // Deterministic shuffle so the cable list isn't pre-grouped by direction
  // (the UI groups it).
  for (let i = cables.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cables[i], cables[j]] = [cables[j], cables[i]];
  }
  return cables;
}

function genFloors(buildingId, floorCount) {
  const floors = [];
  // Floor-level rng so per-floor counts are deterministic per building.
  const rng = mulberry32(hashStr(buildingId) * 13 + 101);
  for (let f = 1; f <= floorCount; f += 1) {
    const count = sampleFloorCableCount(rng);
    floors.push({
      floorNo: f,
      label: `${f}F`,
      cables: genCables(buildingId, f, count),
    });
  }
  return floors;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h * 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ----- main generator ------------------------------------------------------

function sampleName(rng, sourceName) {
  const pool = rng() < 0.6 ? ROAD_WORDS : PARK_WORDS;
  const word = pick(rng, pool);
  const num = 1 + Math.floor(rng() * 999);
  return `${sourceName}-${word}-${String(num).padStart(3, '0')}`;
}

function sampleAddress(rng, lng, lat) {
  // Build a deterministic-ish street address anchored on the building's
  // approximate lat/lng (rounded to make it stable and readable).
  const lngStr = lng.toFixed(4);
  const latStr = lat.toFixed(4);
  const num = 1 + Math.floor(rng() * 300);
  return `重庆市两江新区${pick(rng, ROAD_WORDS)}${num}号 (${lngStr}, ${latStr})`;
}

function allocateBudget(total, slots) {
  // Spread `total` across `slots` entries as evenly as possible, with the
  // first (total % slots) entries each getting +1 so the sum equals total.
  const base = Math.floor(total / slots);
  const extra = total % slots;
  return Array.from({ length: slots }, (_, i) => base + (i < extra ? 1 : 0));
}

function generateAll() {
  const t0 = Date.now();
  const rng = mulberry32(SEED);

  const buildings = [];

  // --- CBD clusters (~70%) -----------------------------------------------
  const cbdAlloc = allocateBudget(CBD_BUDGET, CBD_CLUSTERS.length);
  let cbdIdx = 0;
  for (let ci = 0; ci < CBD_CLUSTERS.length; ci += 1) {
    const cluster = CBD_CLUSTERS[ci];
    const want = cbdAlloc[ci];
    let placed = 0;
    // Reject-sample until we fill the quota (each cluster center sits well
    // inside the bbox, so the rejection rate is low).
    let guard = 0;
    while (placed < want && guard < want * 50) {
      guard += 1;
      const { lng, lat } = sampleCbdBuilding(rng, cluster);
      if (!inBbox(lng, lat)) continue;
      buildings.push(makeBuilding(rng, ++cbdIdx, lng, lat, cluster.name));
      placed += 1;
    }
  }

  // --- Street corridors (~30%) ------------------------------------------
  const streetAlloc = allocateBudget(STREET_BUDGET, STREET_CORRIDORS.length);
  for (let si = 0; si < STREET_CORRIDORS.length; si += 1) {
    const corridor = STREET_CORRIDORS[si];
    const want = streetAlloc[si];
    let placed = 0;
    let guard = 0;
    while (placed < want && guard < want * 50) {
      guard += 1;
      const { lng, lat } = sampleStreetBuilding(rng, corridor);
      if (!inBbox(lng, lat)) continue;
      buildings.push(makeBuilding(rng, ++cbdIdx, lng, lat, corridor.name));
      placed += 1;
    }
  }

  // Index by id for O(1) detail lookups.
  const cablesByBuildingId = new Map();
  let cableTotal = 0;
  for (const b of buildings) {
    cablesByBuildingId.set(b.id, b.floors);
    for (const f of b.floors) cableTotal += f.cables.length;
  }

  const cbdMs = Date.now() - t0;
  return {
    buildings,
    cablesByBuildingId,
    stats: { buildings: buildings.length, cables: cableTotal, cbdMs },
  };

  // makeBuilding declared after generateAll body so it has access to
  // enclosing module scope but reads top-to-bottom in a normal call trace.
  function makeBuilding(rng, idx, lng, lat, sourceName) {
    const id = `BLD-${String(idx).padStart(4, '0')}`;
    const floorCount = sampleFloorCount(rng);
    const floors = genFloors(id, floorCount);
    // v3: per-building RNG for rooms + equipment, seeded from id + floor
    // count so the data is stable across boots but varies by building.
    const bldRng = mulberry32(hashStr(id) * 991 + floorCount * 17 + 5);
    const { rooms, equipment } = generateRoomsAndEquipment(
      { id, floorCount },
      bldRng
    );
    // Footprint from the hand-curated JSON, or null (rectangular slab).
    const fpEntry = footprints[id];
    const footprint = fpEntry ? fpEntry.polygon : null;
    // Unique types present in this building's equipment — used by the
    // map filter panel to show counts per type per building set.
    const equipmentTypes = Array.from(new Set(equipment.map((e) => e.type)));
    return {
      id,
      name: sampleName(rng, sourceName),
      lng,
      lat,
      address: sampleAddress(rng, lng, lat),
      floorCount,
      floors,
      rooms,
      equipment,
      footprint,
      equipmentTypes,
    };
  }
}

// Run once at module load and cache.
const CACHED = generateAll();

export function generateData() {
  return CACHED;
}

export function getBuildingsList() {
  return CACHED.buildings.map((b) => ({
    id: b.id,
    name: b.name,
    lng: b.lng,
    lat: b.lat,
    address: b.address,
    floorCount: b.floorCount,
    cableCount: b.floors.reduce((acc, f) => acc + f.cables.length, 0),
    equipmentTypes: b.equipmentTypes,
  }));
}

export function getBuildingDetail(id) {
  const b = CACHED.buildings.find((x) => x.id === id);
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    lng: b.lng,
    lat: b.lat,
    address: b.address,
    floorCount: b.floorCount,
    floors: b.floors.map((f) => ({
      floorNo: f.floorNo,
      label: f.label,
      cables: f.cables,
    })),
    footprint: b.footprint,
    rooms: b.rooms,
    equipment: b.equipment,
  };
}