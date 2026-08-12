'use client';

// View router: switches between the Leaflet map view and the Three.js
// building view based on the Zustand `view` state. Both children are
// 'use client' (Leaflet / Three.js can't SSR), so we load them through
// next/dynamic with ssr:false — app/page.tsx renders this component
// once; the dynamic child swaps in when the user enters/exits a building.

import dynamic from 'next/dynamic';

import { useViewStore } from '@/lib/store';

const MapView = dynamic(
  () => import('./map/map-view').then((m) => m.MapView),
  { ssr: false },
);

const BuildingPage = dynamic(
  () => import('./building/building-page').then((m) => m.BuildingPage),
  { ssr: false },
);

export function ViewRouter() {
  const view = useViewStore((s) => s.view);
  return view === 'map' ? <MapView /> : <BuildingPage />;
}
