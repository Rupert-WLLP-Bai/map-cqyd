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

export async function fetchBuildings(): Promise<BuildingListEntry[]> {
  return request<BuildingListEntry[]>(LIST_PATH, { cache: 'no-store' });
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
