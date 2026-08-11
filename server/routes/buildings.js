// server/routes/buildings.js
//
// Express Router for /api/buildings.
//
//   GET /                  -> 200 [ { id, name, lng, lat, address,
//                                   floorCount, cableCount }, ... ]
//   GET /:id               -> 200 { id, name, ..., floors: [{ floorNo,
//                                   label, cables: [{...}] }] }
//                          or 404 { error: 'not found', id }

import { Router } from 'express';
import { getBuildingsList, getBuildingDetail } from '../data-generator.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getBuildingsList());
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const detail = getBuildingDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'not found', id });
    return;
  }
  res.json(detail);
});

export default router;