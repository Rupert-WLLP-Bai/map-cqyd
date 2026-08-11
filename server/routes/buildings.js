// server/routes/buildings.js
//
// Express Router for /api/buildings.
//
//   GET /                  -> 200 [ { id, name, lng, lat, address,
//                                   floorCount, cableCount }, ... ]
//   GET /:id               -> 200 { id, name, ..., floors: [{ floorNo,
//                                   label, cables: [{...}] }] }
//                          or 404 { error: 'not found', id }
//
// Coordinates returned by both endpoints are in GCJ-02 (the obfuscated
// Mars-coordinate system that 高德 / 腾讯 / other Chinese map providers
// use), NOT raw WGS-84. The data generator internally works in WGS-84
// (real-world lat/lng) so smoke tests can check the canonical bbox; the
// transform is applied at this boundary so building markers line up with
// the Gaode raster tiles served by the static layer.

import { Router } from 'express';
import { getBuildingsList, getBuildingDetail } from '../data-generator.js';
import { wgs84ToGcj02 } from '../lib/wgs84-to-gcj02.js';

const router = Router();

// Shape: { ...building, lng, lat } -> { ...building, lng, lat } in GCJ-02.
// Light shallow clone so we never mutate the generator's cached objects.
// v3 note: this function ONLY rewrites the top-level `lng`/`lat`. All
// other fields (including v3's `footprint`, `equipment[].position`, and
// `equipmentTypes`) are passed through verbatim — they are either pure
// data (strings, ids, names) or local 2D floor coords expressed in metres
// inside the slab [0, 1] / [-2, 2]. Re-projecting them through GCJ-02
// would corrupt the floor panel layout.
function toGcj02(b) {
  const [lng, lat] = wgs84ToGcj02(b.lng, b.lat);
  return { ...b, lng, lat };
}

router.get('/', (_req, res) => {
  res.json(getBuildingsList().map(toGcj02));
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const detail = getBuildingDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'not found', id });
    return;
  }
  res.json(toGcj02(detail));
});

export default router;