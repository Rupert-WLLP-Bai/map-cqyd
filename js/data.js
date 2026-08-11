// js/data.js
// Canned test data ONLY. No fetch, no backend. Deterministic generator
// produces fixed data so every run is identical. Three buildings in
// Chongqing, each with 4-8 floors, each floor with 15-25 cables spread
// across the four facade directions (Dong/Nan/Xi/Bei), in/out mix.
//
// Shapes (see CONTRACT.md):
//   Building = { id, name, lat, lng, address, floors: Floor[] }
//   Floor    = { floorNo, label, cables: Cable[] }
//   Cable    = { id, name, direction: 'Dong'|'Nan'|'Xi'|'Bei',
//                io: 'in'|'out', peer, type, cores }

export const DIRECTIONS = ['Dong', 'Nan', 'Xi', 'Bei'];

export const DIRECTION_ZH = { Dong: '东', Nan: '南', Xi: '西', Bei: '北' };

// Stable cable-name parts so output looks plausible, not random noise.
const PEERS = [
  '联通核心网', '电信城域网', '移动传输网', '广电接入网',
  'B栋机房', 'C栋接入间', '地下进线间', '楼顶基站',
  '综合布线间', '配线架A', '配线架B', '汇聚交换机',
];
const TYPES = ['光缆', '网线', '电缆', '同轴电缆', '尾纤'];
const CORES = [12, 24, 48, 96, 8, 16, 144, 4];

// Simple deterministic PRNG (mulberry32) so data is fixed per build.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Generate one floor's cables. count is clamped to [15, 25].
// Cables are spread across all four directions, with an in/out mix.
function genCables(buildingId, floorNo, count) {
  const rng = mulberry32(
    buildingId.charCodeAt(0) * 977 + buildingId.length * 31 + floorNo * 7
  );
  const cables = [];
  // Guarantee every direction has at least 2 cables.
  const dirCounts = { Dong: 2, Nan: 2, Xi: 2, Bei: 2 };
  let remaining = count - 8;
  while (remaining > 0) {
    const d = DIRECTIONS[Math.floor(rng() * 4)];
    dirCounts[d] += 1;
    remaining -= 1;
  }
  let seq = 0;
  for (const dir of DIRECTIONS) {
    const n = dirCounts[dir];
    for (let i = 0; i < n; i++) {
      seq += 1;
      const io = rng() < 0.5 ? 'in' : 'out';
      const type = pick(rng, TYPES);
      const cores = pick(rng, CORES);
      const peer = pick(rng, PEERS);
      const num = String(100 + seq).padStart(3, '0');
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
  }
  // Shuffle order deterministically so the list isn't grouped-by-direction
  // before the UI groups it (feels more like real inventory data).
  for (let i = cables.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cables[i], cables[j]] = [cables[j], cables[i]];
  }
  return cables;
}

function genFloors(buildingId, floorCount, baseCount) {
  const floors = [];
  for (let f = 1; f <= floorCount; f += 1) {
    // Vary count per floor but keep within [15, 25].
    const rng = mulberry32(f * 101 + buildingId.length * 13);
    const count = Math.max(15, Math.min(25, baseCount + Math.floor(rng() * 8) - 3));
    floors.push({
      floorNo: f,
      label: `${f}F`,
      cables: genCables(buildingId, f, count),
    });
  }
  return floors;
}

export const BUILDINGS = [
  {
    id: 'BLD-A',
    name: '解放碑数据中心',
    lat: 29.5578,
    lng: 106.5776,
    address: '重庆市渝中区民族路88号',
    floors: genFloors('A', 6, 19),
  },
  {
    id: 'BLD-B',
    name: '观音桥通信枢纽',
    lat: 29.5800,
    lng: 106.5740,
    address: '重庆市江北区建新北路66号',
    floors: genFloors('B', 8, 21),
  },
  {
    id: 'BLD-C',
    name: '南坪信息大厦',
    lat: 29.5230,
    lng: 106.5870,
    address: '重庆市南岸区南坪北路12号',
    floors: genFloors('C', 4, 17),
  },
];
