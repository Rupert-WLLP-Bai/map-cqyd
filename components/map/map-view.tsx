// Leaflet 2D map (v4). One marker per building, clustered via
// leaflet.markercluster so 1k pins stay readable at low zoom. A floating
// equipment-type filter panel toggles marker visibility using the OR
// semantic from v3 (a building is shown when any of its equipmentTypes is
// still enabled).
//
// This file is loaded dynamically by app/page.tsx with `ssr: false`, so
// 'use client' here is the only barrier against SSR — Leaflet touches
// `window` at import time.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Leaflet's default marker icon URLs are relative paths
// ('marker-icon.png' etc). With Next.js those paths 404 because we don't
// ship the PNGs as static assets. Point the default icon at the same
// unpkg CDN that serves the Leaflet JS so markers render without us
// having to configure webpack for asset imports.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

import {
  EQUIPMENT_TYPES,
  useViewStore,
  type EquipmentType,
} from '@/lib/store';
import { useBuildings } from '@/lib/api';
import type { Building } from '@/lib/types';

import { MapFilter } from './map-filter';
import { BuildingPopup } from './building-popup';

// --- Tile config ---------------------------------------------------------
//
// Gaode (高德) raster tiles. Why not OSM / CartoDB / Stadia: those CDNs
// are unreachable from this network (8 s timeout → gray rectangles
// everywhere). Gaode is fast (~200 ms) and has full coverage for 两江新区.
// Gaode uses GCJ-02 (火星坐标系), so the API transforms building
// coordinates from WGS-84 -> GCJ-02 before sending them to the frontend;
// that's why building markers line up with the basemap.
//
// Style 8 = 标准地图 (raster standard). Subdomains 1..4 map to webrd01..04.
const TILE_URL =
  'https://webrd0{s}.is.autonavi.com/appmaptile' +
  '?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
const TILE_ATTRIB = '&copy; 高德地图';

// --- Map registry entry --------------------------------------------------
interface MapRegistryEntry {
  marker: L.Marker;
  types: EquipmentType[];
}

// --- Per-type counts -----------------------------------------------------
type TypeCounts = Record<EquipmentType, number>;

function computeCounts(buildings: Building[] | undefined): TypeCounts {
  const counts: TypeCounts = {
    '一级配电箱': 0,
    '二级配电箱': 0,
    OTN: 0,
    光交: 0,
  };
  if (!buildings) return counts;
  for (const b of buildings) {
    const types = b.equipmentTypes ?? [];
    for (const t of types) {
      if (t in counts) {
        counts[t] += 1;
      }
    }
  }
  return counts;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRegistryRef = useRef<Map<string, MapRegistryEntry> | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  const { data: buildings } = useBuildings();
  const enterBuilding = useViewStore((s) => s.enterBuilding);
  const enabledTypes = useViewStore((s) => s.enabledTypes);
  const setEnabledTypes = useViewStore((s) => s.setEnabledTypes);

  // Counts only depend on the buildings payload, not the filter state.
  const counts = useMemo(() => computeCounts(buildings), [buildings]);

  // -- Init map + markers ------------------------------------------------
  //
  // Run once on mount. Adding buildings into a cluster group (rather than
  // directly onto the map) is what keeps 1k pins usable: low zoom shows
  // counted cluster circles, zooming in splits them until individual pins
  // appear.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIB,
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
    }).addTo(map);

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
    });

    const registry = new Map<string, MapRegistryEntry>();

    leafletMapRef.current = map;
    clusterGroupRef.current = clusterGroup;
    mapRegistryRef.current = registry;

    // Defer the initial fit + marker add until the buildings payload
    // arrives. We re-run the marker add from a separate effect so this
    // init effect can stay mount-only (no rebuild on every refetch).

    return () => {
      // Cleanup on unmount: tear down the cluster group, registry, and the
      // Leaflet map itself. Without these Next.js route transitions leak
      // tile <img> nodes and lose event handlers.
      clusterGroup.clearLayers();
      map.removeLayer(clusterGroup);
      map.remove();
      leafletMapRef.current = null;
      clusterGroupRef.current = null;
      mapRegistryRef.current = null;
    };
  }, []);

  // -- Populate markers from the buildings payload -----------------------
  //
  // Re-runs whenever the buildings list reference changes. We rebuild the
  // registry from scratch because the dataset is stable across reloads
  // and rebuild-vs-diff is simpler than tracking per-id deltas.
  useEffect(() => {
    const map = leafletMapRef.current;
    const clusterGroup = clusterGroupRef.current;
    const registry = mapRegistryRef.current;
    if (!map || !clusterGroup || !registry) return;
    if (!buildings) return;

    clusterGroup.clearLayers();
    registry.clear();

    const latlngs: L.LatLngTuple[] = [];
    for (const b of buildings) {
      const marker = L.marker([b.lat, b.lng], {
        title: b.name,
        alt: b.name,
      });

      // Render the popup body from React so it matches building-popup.tsx.
      // renderToString is fine here: popup content is static for the life
      // of a single binding, and the user has to close the popup to
      // re-trigger it.
      const popupHtml = renderToString(
        <BuildingPopup
          id={b.id}
          name={b.name}
          address={b.address}
          floorCount={b.floorCount}
        />,
      );

      marker.bindPopup(popupHtml, { closeButton: true, minWidth: 180 });

      // The button lives in the rendered popup DOM; delegate via
      // popupopen so the element exists before we query it. The marker
      // click also navigates directly (matches old behaviour).
      marker.on('popupopen', (ev: L.LeafletEvent) => {
        const popup = (ev as unknown as { popup: L.Popup }).popup;
        const root = popup.getElement();
        if (!root) return;
        const btn = root.querySelector<HTMLButtonElement>('.bld-popup__btn');
        if (btn) {
          btn.addEventListener('click', () => {
            map.closePopup();
            enterBuilding(b.id, b.floorCount);
          });
        }
      });

      marker.on('click', () => {
        enterBuilding(b.id, b.floorCount);
      });

      clusterGroup.addLayer(marker);
      const types: EquipmentType[] = (b.equipmentTypes ?? []).filter(
        (t): t is EquipmentType => (EQUIPMENT_TYPES as string[]).includes(t),
      );
      registry.set(b.id, { marker, types });
      latlngs.push([b.lat, b.lng]);
    }

    map.addLayer(clusterGroup);

    // Frame the map on the data, padded so pins don't kiss the edges.
    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs).pad(0.35);
      map.fitBounds(bounds, { animate: false });
    }

    // Apply the current filter so the initial paint reflects it.
    applyFilter(enabledTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, enterBuilding]);

  // -- React to filter changes -------------------------------------------
  //
  // OR semantic: show building when at least one of its equipmentTypes
  // is still enabled. addLayer / removeLayer lets markercluster recompute
  // clusters automatically.
  useEffect(() => {
    applyFilter(enabledTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledTypes]);

  function applyFilter(enabled: Set<EquipmentType>) {
    const clusterGroup = clusterGroupRef.current;
    const registry = mapRegistryRef.current;
    if (!clusterGroup || !registry) return;

    for (const [id, entry] of registry) {
      const visible = entry.types.some((t) => enabled.has(t));
      const inCluster = clusterGroup.hasLayer(entry.marker);
      if (visible && !inCluster) {
        clusterGroup.addLayer(entry.marker);
      } else if (!visible && inCluster) {
        clusterGroup.removeLayer(entry.marker);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        // Slightly darker background that matches Gaode's land color so
        // users don't see the default Leaflet pale gray flash on slow
        // networks.
        background: '#e8e4dc',
      }}
    >
      <MapFilter
        counts={counts}
        enabledTypes={enabledTypes}
        onToggle={(t) => useViewStore.getState().toggleType(t)}
        onSelectAll={() =>
          setEnabledTypes(new Set<EquipmentType>(EQUIPMENT_TYPES))
        }
        onSelectNone={() => setEnabledTypes(new Set<EquipmentType>())}
      />
    </div>
  );
}