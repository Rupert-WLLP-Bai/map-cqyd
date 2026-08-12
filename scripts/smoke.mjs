#!/usr/bin/env node
// scripts/smoke.mjs
//
// Smoke tests for the data generator (v4 port of v3 server/smoke.js).
// Uses node:test (built into Node 18+). Run via the project npm script:
//
//   npm run smoke
//     -> node --experimental-strip-types --test scripts/smoke.mjs
//
// Approach: in-process import of the TS data-generator through Node's
// `--experimental-strip-types` type stripping. We choose the in-process path
// over curling a booted dev server so the run is hermetic (no server, no
// port) and covers the generator itself rather than a server's projection
// of it.
//
// Why the resolve hook below: server/*.ts import each other the way every
// other module in this Next.js codebase does — extensionless ('./rng') —
// which is what webpack and `tsc` expect. Node's ESM resolver, by contrast,
// demands a literal file extension and will not guess '.ts'. Rather than
// contort the source imports (or the shared tsconfig) for the sake of this
// one script, the script teaches its own resolver to append '.ts'. The hook
// must be installed before the generator is loaded, hence the dynamic
// import.
//
// Assertions: the 13 from v3, plus v3's cable-ID uniqueness check (kept so
// the port doesn't lose coverage) and a new v4 check that equipmentTypes is
// deduplicated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only relative, extensionless specifiers are ambiguous; everything else
    // (bare packages, node: builtins, explicit .ts/.js/.json) goes straight
    // through to the default resolver.
    if (specifier.startsWith('.') && !/\.([cm]?[jt]s|json)$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Fall through to the default resolution so the original (more
        // useful) error surfaces.
      }
    }
    return nextResolve(specifier, context);
  },
});

const { generateData } = await import('../server/data-generator.ts');

const BBOX = { minLng: 106.48, maxLng: 106.72, minLat: 29.52, maxLat: 29.74 };
const VALID_DIRECTIONS = new Set(['Dong', 'Nan', 'Xi', 'Bei']);
const VALID_IO = new Set(['in', 'out']);

const { buildings, cablesByBuildingId } = generateData();

// ----- (a) bbox ------------------------------------------------------------

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

// ----- (b) building count --------------------------------------------------

test('building count is 950-1050 (1k ± 5%)', () => {
  assert.ok(buildings.length >= 950, `too few buildings: ${buildings.length}`);
  assert.ok(buildings.length <= 1050, `too many buildings: ${buildings.length}`);
});

// ----- (c) cable count -----------------------------------------------------

test('total cable count is 9000-11000 (10k ± 10%)', () => {
  let total = 0;
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    for (const f of floors) total += f.cables.length;
  }
  assert.ok(total >= 9000, `too few cables: ${total}`);
  assert.ok(total <= 11000, `too many cables: ${total}`);
});

// ----- (d) floors / cables present ----------------------------------------

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

// ----- (e) cable field enums ----------------------------------------------

test('every cable has valid direction, io, and positive integer cores', () => {
  for (const b of buildings) {
    const floors = cablesByBuildingId.get(b.id);
    for (const f of floors) {
      for (const c of f.cables) {
        assert.ok(
          VALID_DIRECTIONS.has(c.direction),
          `bad direction ${c.direction} in ${c.id}`
        );
        assert.ok(VALID_IO.has(c.io), `bad io ${c.io} in ${c.id}`);
        assert.ok(
          Number.isInteger(c.cores) && c.cores > 0,
          `bad cores ${c.cores} in ${c.id}`
        );
      }
    }
  }
});

// ----- (f) names / coords -------------------------------------------------

test('names are non-empty strings; lat/lng are finite numbers', () => {
  for (const b of buildings) {
    assert.equal(typeof b.name, 'string');
    assert.ok(b.name.length > 0, `building ${b.id} has empty name`);
    assert.ok(Number.isFinite(b.lat), `bad lat on ${b.id}`);
    assert.ok(Number.isFinite(b.lng), `bad lng on ${b.id}`);
  }
});

// ----- (v3 carry-over) cable ID uniqueness --------------------------------

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

// ----- Equipment + Room + footprint (v3 entities) -------------------------

const VALID_EQUIPMENT_TYPES = new Set([
  '一级配电箱',
  '二级配电箱',
  'OTN',
  '光交',
]);
const VALID_EQUIPMENT_STATUS = new Set(['online', 'offline']);

// ----- (g) equipmentTypes non-empty ---------------------------------------

test('every building has a non-empty equipmentTypes list', () => {
  for (const b of buildings) {
    assert.ok(
      Array.isArray(b.equipmentTypes) && b.equipmentTypes.length >= 1,
      `building ${b.id} has empty equipmentTypes`
    );
  }
});

// ----- (h) equipmentTypes enum -------------------------------------------

test('every equipmentTypes entry is a legal type', () => {
  for (const b of buildings) {
    for (const t of b.equipmentTypes) {
      assert.ok(
        VALID_EQUIPMENT_TYPES.has(t),
        `building ${b.id} has unknown equipment type "${t}"`
      );
    }
  }
});

// ----- (i) one 一级配电箱 per building ------------------------------------

test('every building has at least one 一级配电箱', () => {
  for (const b of buildings) {
    const has = (b.equipment || []).some((e) => e.type === '一级配电箱');
    assert.ok(has, `building ${b.id} has no 一级配电箱`);
  }
});

// ----- (j) Equipment.status enum -----------------------------------------

test('every Equipment.status is online or offline', () => {
  for (const b of buildings) {
    for (const e of b.equipment || []) {
      assert.ok(
        VALID_EQUIPMENT_STATUS.has(e.status),
        `bad status ${e.status} on ${e.id}`
      );
    }
  }
});

// ----- (k) Equipment.position in [0, 1] ----------------------------------

test('every Equipment.position.x and .position.y is in [0, 1]', () => {
  for (const b of buildings) {
    for (const e of b.equipment || []) {
      assert.ok(
        e.position &&
          typeof e.position.x === 'number' &&
          e.position.x >= 0 &&
          e.position.x <= 1,
        `bad position.x on ${e.id}: ${e.position && e.position.x}`
      );
      assert.ok(
        e.position &&
          typeof e.position.y === 'number' &&
          e.position.y >= 0 &&
          e.position.y <= 1,
        `bad position.y on ${e.id}: ${e.position && e.position.y}`
      );
    }
  }
});

// ----- (l) rooms + equipment + footprint fields --------------------------

test('every building has rooms + equipment + footprint fields', () => {
  for (const b of buildings) {
    assert.ok(Array.isArray(b.rooms), `building ${b.id} missing rooms`);
    assert.ok(Array.isArray(b.equipment), `building ${b.id} missing equipment`);
    assert.ok(
      b.footprint === null || Array.isArray(b.footprint),
      `building ${b.id} footprint not null-or-array`
    );
  }
});

// ----- (m) equipmentTypes deduped ---------------------------------------

test('equipmentTypes is deduplicated on every building', () => {
  for (const b of buildings) {
    assert.equal(
      new Set(b.equipmentTypes).size,
      b.equipmentTypes.length,
      `building ${b.id} has duplicate equipmentTypes: ${b.equipmentTypes.join(', ')}`
    );
  }
});
