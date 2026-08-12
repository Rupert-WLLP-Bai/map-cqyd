// app/api/buildings/[id]/route.ts
//
// GET /api/buildings/:id -> BuildingDetail (or 404)
//
// Returns one building's full payload (floors, rooms, equipment, footprint).
// Coordinates are rewritten from the canonical WGS-84 internal
// representation to GCJ-02 at the API boundary so the Leaflet marker and
// the Three.js building render line up with the Gaode raster basemap.
// Footprint / equipment.position (local 2D slab coords) are not transformed
// — only top-level `lng` / `lat` are.

import { NextResponse } from 'next/server';

import { getBuildingDetail } from '@/server/data-generator';
import { wgs84ToGcj02 } from '@/lib/gcj02';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: Request,
  ctx: RouteContext
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const detail = getBuildingDetail(id);
  if (!detail) {
    return NextResponse.json({ error: 'not found', id }, { status: 404 });
  }
  const [lng, lat] = wgs84ToGcj02(detail.lng, detail.lat);
  return NextResponse.json({ ...detail, lng, lat });
}
