// lib/api-client.ts
//
// Browser/server fetch wrapper for the v4 /api/buildings endpoints. The
// TanStack Query hooks layer (lib/api.ts) calls into these; they throw
// ApiError on non-2xx so the query layer can branch on status without
// parsing error JSON twice.

import type { Building, BuildingListEntry } from './types';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.name = 'ApiError';
    this.status = status;
  }
}

const LIST_PATH = '/api/buildings';
const DETAIL_PATH = (id: string): string => `/api/buildings/${id}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchBuildings(): Promise<Building[]> {
  const list = await request<BuildingListEntry[]>(LIST_PATH, {
    cache: 'no-store',
  });
  // GET /api/buildings omits the heavy floors/rooms/equipment arrays (~1000
  // buildings x ~10k cables would be megabytes on the wire). Fill the absent
  // members with empty defaults so the returned objects genuinely satisfy
  // `Building` at runtime instead of being cast into a lie: map code reads
  // only id/name/lng/lat/equipmentTypes, and the per-building detail request
  // supplies the real arrays.
  return list.map((b) => ({
    floors: [],
    rooms: [],
    equipment: [],
    footprint: null,
    ...b,
  }));
}

export async function fetchBuilding(id: string): Promise<Building> {
  try {
    return await request<Building>(DETAIL_PATH(id), { cache: 'no-store' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Re-throw a more contextual message; the status is still 404.
      throw new ApiError(404, `building ${id} not found`);
    }
    throw err;
  }
}
