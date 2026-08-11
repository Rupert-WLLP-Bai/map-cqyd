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