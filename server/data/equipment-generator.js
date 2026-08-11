// server/data/equipment-generator.js
//
// v3: Generate Room + Equipment entities for one building.
//
//   Rooms:    1F always has 1 'main'; 3F+ may have an 'aux' on some floors;
//             tall buildings (floorCount >= 6) may add 1-2 'riser'.
//   Equipment per spec:
//     - 一级配电箱: exactly 1 per building, lives in a 'main' room
//     - 二级配电箱: 1-3 per floor (all floors), in any room on that floor
//     - OTN:       0-1 per building (rare, also in 'main')
//     - 光交:       0-2 per floor, any room
//     - status:    80% 'online' / 20% 'offline'
//     - position:  { x, y } local to the floor, x,y in [0, 1]
//
// Equipment is split between the per-floor types (二级配电箱, 光交) and the
// per-building types (一级配电箱, OTN). The per-floor types get attached to a
// room on the same floor so the building panel can render them under the
// right floor group.
//
// IDs are unique across the whole generated set via module-level counters
// so collision with the per-building name-based cable IDs is impossible
// (cables use the BLD-NNNN-Fn-Dir-NNN shape; rooms are RM-NNNNN, equipment
// EQ-NNNNN).

import { mulberry32 } from '../lib/rng.js';

const MAIN_NAMES = ['主设备间', 'B栋机房', '进线间', '核心机房'];
const AUX_NAMES  = ['辅设备间', '配线间', '通信间', '弱电设备间'];
const RISER_NAMES = ['弱电井', '竖向通道', '综合布线井'];

const EQ_TYPES = ['一级配电箱', '二级配电箱', 'OTN', '光交'];

// Module-level counters — monotonically increasing across every call.
let _roomCounter = 0;
let _eqCounter   = 0;

function nextRoomId() {
  _roomCounter += 1;
  return `RM-${String(_roomCounter).padStart(5, '0')}`;
}

function nextEqId() {
  _eqCounter += 1;
  return `EQ-${String(_eqCounter).padStart(5, '0')}`;
}

// Reset counters — exported so data-generator.js can re-run from scratch
// during module init without polluting IDs across regenerations. (Each
// `node` boot starts fresh; this is mostly a safety hatch for tests.)
export function resetIdCounters() {
  _roomCounter = 0;
  _eqCounter = 0;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function intInRange(rng, min, max) {
  // inclusive on both ends
  return min + Math.floor(rng() * (max - min + 1));
}

function randomPosition(rng) {
  // Spec: position in [0, 1].
  return { x: rng(), y: rng() };
}

function randomStatus(rng) {
  // 80% online / 20% offline.
  return rng() < 0.8 ? 'online' : 'offline';
}

// Decide which floors get an aux room. Spec: "3F+ may have 1 aux".
// We give a floor an aux with probability 0.35 if floor >= 3.
function shouldHaveAux(rng, floorNo) {
  if (floorNo < 3) return false;
  return rng() < 0.35;
}

// Decide how many risers on a tall building (floorCount >= 6). 1-2.
// Probability of having any rises is ~0.6 (so most tall buildings get 0-1).
function shouldHaveRisers(rng, floorCount) {
  if (floorCount < 6) return false;
  return rng() < 0.6;
}

/**
 * Generate rooms + equipment for a single building.
 * @param {object} building - { id, floorCount, ... }
 * @param {() => number} rng - seeded RNG for this building (deterministic
 *                              per building so boots reproduce the same
 *                              data).
 * @returns {{ rooms: Room[], equipment: Equipment[] }}
 */
export function generateRoomsAndEquipment(building, rng) {
  const rooms = [];
  const equipment = [];

  // Index of rooms per floor for equipment placement.
  const roomsByFloor = new Map();
  const mainRoomIds = [];     // for 一级配电箱 (1 per building, on 1F 'main')
  const allRoomsByFloor = new Map();

  // --- 1F always has a 'main' room ---
  const f1Room = {
    id: nextRoomId(),
    buildingId: building.id,
    name: pick(rng, MAIN_NAMES),
    floorNo: 1,
    type: 'main',
  };
  rooms.push(f1Room);
  roomsByFloor.set(1, [f1Room]);
  allRoomsByFloor.set(1, [f1Room]);
  mainRoomIds.push(f1Room.id);

  // --- 3F+ may each have 1 'aux' room ---
  for (let f = 2; f <= building.floorCount; f += 1) {
    const floorRooms = [];
    if (shouldHaveAux(rng, f)) {
      const aux = {
        id: nextRoomId(),
        buildingId: building.id,
        name: pick(rng, AUX_NAMES),
        floorNo: f,
        type: 'aux',
      };
      rooms.push(aux);
      floorRooms.push(aux);
    }
    // Every floor always has at least the implicit "open floor area" which
    // we model as zero rooms — equipment can be placed on roomsByFloor.get(f)
    // only if there's at least one. We'll synthesize equipment-only entries
    // by allowing placement in any "room" on that floor; when there isn't
    // one we use the 1F main as fallback (so 一级配电箱 always has a roomId
    // pointing at something that exists on 1F; 二级配电箱 / 光交 placed on
    // empty floors fall back to "main" too via the room-finder below).
    roomsByFloor.set(f, floorRooms);
    if (floorRooms.length > 0) allRoomsByFloor.set(f, floorRooms);
  }

  // --- Tall buildings may add 1-2 riser rooms (for vertical runs) ---
  if (shouldHaveRisers(rng, building.floorCount)) {
    const count = intInRange(rng, 1, 2);
    // Place risers at random mid floors so they straddle multiple floors.
    const placedOn = new Set();
    for (let i = 0; i < count; i += 1) {
      // Pick a floor in [2, floorCount-1] that doesn't already have a riser.
      let f = intInRange(rng, 2, building.floorCount - 1);
      let guard = 0;
      while (placedOn.has(f) && guard < 10) {
        f = intInRange(rng, 2, building.floorCount - 1);
        guard += 1;
      }
      placedOn.add(f);
      const riser = {
        id: nextRoomId(),
        buildingId: building.id,
        name: pick(rng, RISER_NAMES),
        floorNo: f,
        type: 'riser',
      };
      rooms.push(riser);
      const floorList = roomsByFloor.get(f) || [];
      floorList.push(riser);
      roomsByFloor.set(f, floorList);
      const all = allRoomsByFloor.get(f) || [];
      all.push(riser);
      allRoomsByFloor.set(f, all);
    }
  }

  // Helper: pick a room for equipment placement on floor `f`. Prefers
  // local-floor rooms, falls back to 1F main for empty floors.
  function roomForFloor(f) {
    const local = (allRoomsByFloor.get(f) || []);
    if (local.length > 0) return pick(rng, local);
    return f1Room;
  }

  // --- 一级配电箱: exactly 1 per building, in a 'main' room ---
  const lvl1 = {
    id: nextEqId(),
    buildingId: building.id,
    type: '一级配电箱',
    floorNo: 1,
    roomId: f1Room.id,
    status: randomStatus(rng),
    position: randomPosition(rng),
  };
  equipment.push(lvl1);

  // --- OTN: 0-1 per building (rare, also in 'main') ---
  if (rng() < 0.4) {
    // 40% chance to include an OTN on this building.
    equipment.push({
      id: nextEqId(),
      buildingId: building.id,
      type: 'OTN',
      floorNo: 1,
      roomId: f1Room.id,
      status: randomStatus(rng),
      position: randomPosition(rng),
    });
  }

  // --- 二级配电箱: 1-3 per floor (all floors) ---
  for (let f = 1; f <= building.floorCount; f += 1) {
    const count = intInRange(rng, 1, 3);
    for (let i = 0; i < count; i += 1) {
      const r = roomForFloor(f);
      equipment.push({
        id: nextEqId(),
        buildingId: building.id,
        type: '二级配电箱',
        floorNo: f,
        roomId: r.id,
        status: randomStatus(rng),
        position: randomPosition(rng),
      });
    }
  }

  // --- 光交: 0-2 per floor (any room), some floors may have none ---
  for (let f = 1; f <= building.floorCount; f += 1) {
    const count = intInRange(rng, 0, 2);
    for (let i = 0; i < count; i += 1) {
      const r = roomForFloor(f);
      equipment.push({
        id: nextEqId(),
        buildingId: building.id,
        type: '光交',
        floorNo: f,
        roomId: r.id,
        status: randomStatus(rng),
        position: randomPosition(rng),
      });
    }
  }

  return { rooms, equipment };
}

// Exported for test introspection.
export const __EQ_TYPES = EQ_TYPES;
