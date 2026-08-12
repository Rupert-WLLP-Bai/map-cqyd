// app/api/buildings/route.ts
//
// GET /api/buildings -> BuildingListEntry[]
//
// Returns the light-weight list payload (no floors/rooms/equipment) for
// every generated building. Coordinates are rewritten from the canonical
// WGS-84 internal representation to GCJ-02 at the API boundary so the
// Leaflet markers line up with the Gaode raster basemap. Footprint /
// equipment.position (local 2D slab coords) are not transformed — only
// top-level `lng` / `lat` are.

import { NextResponse } from 'next/server';

import { getBuildingsList } from '@/server/data-generator';
import { wgs84ToGcj02 } from '@/lib/gcj02';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const list = getBuildingsList().map((b) => {
    const [lng, lat] = wgs84ToGcj02(b.lng, b.lat);
    return { ...b, lng, lat };
  });
  return NextResponse.json(list);
}
