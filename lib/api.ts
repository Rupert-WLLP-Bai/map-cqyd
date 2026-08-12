// TanStack Query hooks. The transport layer (fetch wrapper + ApiError) and
// the Building type are owned by ./api-client and ./types respectively
// (Backend agent). This file only declares the query shape so view code can
// pull typed server state without coupling to fetch details.

import { useQuery } from '@tanstack/react-query';

import { fetchBuildings, fetchBuilding, ApiError } from './api-client';
import type { Building } from './types';

/**
 * All buildings, without floor/cable detail. Refreshed only every 5 min
 * since the demo backend generates the dataset once at boot.
 */
export function useBuildings() {
  return useQuery<Building[], ApiError>({
    queryKey: ['buildings'],
    queryFn: fetchBuildings,
    staleTime: 5 * 60_000,
  });
}

/**
 * One building with its floors, cables, equipment, rooms, and footprint.
 * Disabled when `id` is null (no building selected).
 */
export function useBuilding(id: string | null) {
  return useQuery<Building, ApiError>({
    queryKey: ['building', id],
    queryFn: () => fetchBuilding(id!),
    enabled: !!id,
  });
}