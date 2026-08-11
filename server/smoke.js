// server/smoke.js
//
// Smoke tests for the data generator. Uses node:test (built into Node 18+).
// Run with:  node --test server/smoke.js
//
// These are intentionally schema-shape / count-band tests, not exhaustive
// ones. They prove the generator is wired up and the v2 spec is satisfied.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateData } from './data-generator.js';

const BBOX = { minLng: 106.48, maxLng: 106.72, minLat: 29.52, maxLat: 29.74 };
const VALID_DIRECTIONS = new Set(['Dong', 'Nan', 'Xi', 'Bei']);
const VALID_IO = new Set(['in', 'out']);

const { buildings, cablesByBuildingId } = generateData();

test('all buildings lie inside 两江新区 bbox', () => {
  for (const b of buildings) {
    assert.ok(
      b.lng >= BBOX.minLng && b.lng <= BBOX.maxLng,
      `building ${b.id} lng ${b.lng} out of bbox`
    );
    assert.ok(
      b.lat >= BBOX.minLat && b.lat <= BBOX.maxLat,
      `building ${b.id} lat ${b.lat} out of bbox`
    );
  }
});

test('building count is 950-1050 (1k ± 5%)', () => {
  assert.ok(buildings.length >= 950, `too few buildings: ${buildings.length}`);
  assert.ok(buildings.length <= 1050, `too many buildings: ${buildings.length}`);
});

test('total cable count is 9000-11000 (10k ± 10%)', () => {
  let total = 0;
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    for (const f of floors) total += f.cables.length;
  }
  assert.ok(total >= 9000, `too few cables: ${total}`);
  assert.ok(total <= 11000, `too many cables: ${total}`);
});

test('every building has at least one floor; every floor has at least one cable', () => {
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    assert.ok(floors.length >= 1, `building ${b.id} has no floors`);
    for (const f of floors) {
      assert.ok(
        f.cables.length >= 1,
        `building ${b.id} floor ${f.floorNo} has no cables`
      );
    }
  }
});

test('every cable has valid direction, io, and positive integer cores', () => {
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    for (const f of floors) {
      for (const c of f.cables) {
        assert.ok(
          VALID_DIRECTIONS.has(c.direction),
          `bad direction ${c.direction} in ${c.id}`
        );
        assert.ok(
          VALID_IO.has(c.io),
          `bad io ${c.io} in ${c.id}`
        );
        assert.ok(
          Number.isInteger(c.cores) && c.cores > 0,
          `bad cores ${c.cores} in ${c.id}`
        );
      }
    }
  }
});

test('names are non-empty strings; lat/lng are finite numbers', () => {
  for (const b of buildings) {
    assert.equal(typeof b.name, 'string');
    assert.ok(b.name.length > 0, `building ${b.id} has empty name`);
    assert.ok(Number.isFinite(b.lat), `bad lat on ${b.id}`);
    assert.ok(Number.isFinite(b.lng), `bad lng on ${b.id}`);
  }
});

test('cable IDs are unique across the whole generated set', () => {
  const seen = new Set();
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    for (const f of floors) {
      for (const c of f.cables) {
        assert.ok(!seen.has(c.id), `duplicate cable id ${c.id}`);
        seen.add(c.id);
      }
    }
  }
});

// ----- v3: Equipment + Room + footprint ------------------------------------

const VALID_EQUIPMENT_TYPES = new Set([
  '一级配电箱',
  '二级配电箱',
  'OTN',
  '光交',
]);
const VALID_EQUIPMENT_STATUS = new Set(['online', 'offline']);

test('v3: every building has a non-empty equipmentTypes list', () => {
  for (const b of buildings) {
    assert.ok(
      Array.isArray(b.equipmentTypes) && b.equipmentTypes.length >= 1,
      `building ${b.id} has empty equipmentTypes`
    );
  }
});

test('v3: every equipmentTypes entry is a legal type', () => {
  for (const b of buildings) {
    for (const t of b.equipmentTypes) {
      assert.ok(
        VALID_EQUIPMENT_TYPES.has(t),
        `building ${b.id} has unknown equipment type "${t}"`
      );
    }
  }
});

test('v3: every building has at least one 一级配电箱', () => {
  for (const b of buildings) {
    const has = (b.equipment || []).some((e) => e.type === '一级配电箱');
    assert.ok(has, `building ${b.id} has no 一级配电箱`);
  }
});

test('v3: every Equipment.status is online or offline', () => {
  for (const b of buildings) {
    for (const e of b.equipment || []) {
      assert.ok(
        VALID_EQUIPMENT_STATUS.has(e.status),
        `bad status ${e.status} on ${e.id}`
      );
    }
  }
});

test('v3: every Equipment.position.x and .position.y is in [0, 1]', () => {
  for (const b of buildings) {
    for (const e of b.equipment || []) {
      assert.ok(
        e.position && typeof e.position.x === 'number'
          && e.position.x >= 0 && e.position.x <= 1,
        `bad position.x on ${e.id}: ${e.position && e.position.x}`
      );
      assert.ok(
        e.position && typeof e.position.y === 'number'
          && e.position.y >= 0 && e.position.y <= 1,
        `bad position.y on ${e.id}: ${e.position && e.position.y}`
      );
    }
  }
});

test('v3: every building has rooms + equipment + footprint fields', () => {
  for (const b of buildings) {
    assert.ok(Array.isArray(b.rooms), `building ${b.id} missing rooms`);
    assert.ok(Array.isArray(b.equipment), `building ${b.id} missing equipment`);
    assert.ok(
      b.footprint === null || Array.isArray(b.footprint),
      `building ${b.id} footprint not null-or-array`
    );
  }
});