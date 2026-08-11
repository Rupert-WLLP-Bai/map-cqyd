// js/map-view.js
// Leaflet 2D map with one marker per building. Clicking a marker (or the
// "进入楼宇" button in its popup) calls onSelectBuilding(building.id).
//
// At 1k buildings a flat marker layer is unreadable (and slow to lay out), so
// every marker goes into a Leaflet.markercluster group: low zoom shows counted
// cluster circles, zooming in splits them until individual pins appear.
//
// A floating equipment-type filter panel is mounted at the top-left of the
// map container and toggles marker visibility (OR semantic: a building is
// shown when any of its equipmentTypes is still enabled).
//
// Uses the globals L and L.markerClusterGroup that index.html loaded via the
// Leaflet + Leaflet.markercluster CDN script tags. No build step, no npm.
// ES module.

import { createMapFilter } from './map-filter.js';

const FILTER_TYPES = ['一级配电箱', '二级配电箱', 'OTN', '光交'];

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

/**
 * Render a Leaflet map into `container` with one marker per building.
 *
 * @param {HTMLElement} container      - mount element (#map-view)
 * @param {Array} buildings           - BUILDINGS from data.js
 * @param {(id: string) => void} onSelectBuilding - called with building.id
 * @returns {{ invalidateSize: () => void }} handle (call invalidateSize when
 *          the container becomes visible, e.g. returning to the map view)
 */
export function initMapView(container, buildings, onSelectBuilding) {
  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIB,
    subdomains: ['1', '2', '3', '4'], // webrd01 / webrd02 / webrd03 / webrd04
    maxZoom: 18,                      // Gaode raster tops out around z=18
    // Background fill for the few seconds before tiles arrive, so users
    // don't see the default Leaflet pale gray flash on slow networks.
    // (The CSS on .leaflet-container provides a slightly darker fill
    //  that matches the tile's land color closely.)
  }).addTo(map);

  // Fit bounds to all buildings so the demo opens framed on the data.
  const latlngs = buildings.map((b) => [b.lat, b.lng]);
  const bounds = L.latLngBounds(latlngs).pad(0.35);
  map.fitBounds(bounds, { animate: false });

  // One marker per building, all held by a cluster group rather than added to
  // the map directly — that is what keeps 1k pins usable. Cluster click keeps
  // the library default (zoom to the cluster's bounds); at max zoom overlapping
  // markers spiderfy instead of hiding each other. The cluster icon is the
  // library default so css/styles.css can restyle it by class.
  const clusterGroup = L.markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
  });

  // Per-type building counts: for each building, increment every one of its
  // equipmentTypes. The counts feed the filter panel readouts; they are
  // computed once at init since they do not change with the filter state.
  const typeCounts = Object.create(null);
  for (const t of FILTER_TYPES) typeCounts[t] = 0;
  for (const b of buildings) {
    const types = b.equipmentTypes || [];
    for (const t of types) {
      if (Object.prototype.hasOwnProperty.call(typeCounts, t)) {
        typeCounts[t] += 1;
      }
    }
  }

  // buildingId -> { marker, types[] } so the filter can add/remove markers
  // by id and remember each building's equipment types for the OR check.
  const markerRegistry = new Map();

  buildings.forEach((b) => {
    const marker = L.marker([b.lat, b.lng], {
      title: b.name,
      alt: b.name,
    });

    const popupHtml =
      `<div class="bld-popup">` +
      `<div class="bld-popup__name">${escapeHtml(b.name)}</div>` +
      `<div class="bld-popup__addr">${escapeHtml(b.address)}</div>` +
      `<button type="button" class="bld-popup__btn" data-bld-id="${escapeAttr(b.id)}">` +
      `进入楼宇` +
      `</button>` +
      `</div>`;

    marker.bindPopup(popupHtml, { closeButton: true, minWidth: 180 });

    // Clicking the marker (aside from opening the popup) selects the building.
    marker.on('click', () => onSelectBuilding(b.id));

    // The popup button lives in the rendered DOM; delegate via popupopen so
    // the element exists before we query it.
    marker.on('popupopen', (ev) => {
      const root = ev.popup.getElement();
      if (!root) return;
      const btn = root.querySelector('.bld-popup__btn');
      if (btn) {
        btn.addEventListener('click', () => {
          map.closePopup();
          onSelectBuilding(b.id);
        });
      }
    });

    clusterGroup.addLayer(marker);
    markerRegistry.set(b.id, {
      marker,
      types: Array.isArray(b.equipmentTypes) ? b.equipmentTypes : [],
    });
  });

  map.addLayer(clusterGroup);

  // Floating equipment-type filter panel. The panel is a child of the map
  // container (Leaflet-friendly: it sits inside the positioned .leaflet-
  // container which gives `position: absolute` a reference), at top-left so
  // it rests above the zoom control.
  const filter = createMapFilter({
    counts: typeCounts,
    initialEnabled: new Set(FILTER_TYPES),
    onChange(enabled) {
      // OR semantic: show building when at least one of its equipmentTypes
      // is still enabled. addLayer / removeLayer let markercluster recompute
      // clusters automatically.
      for (const [id, entry] of markerRegistry) {
        const visible = entry.types.some((t) => enabled.has(t));
        const inCluster = clusterGroup.hasLayer(entry.marker);
        if (visible && !inCluster) {
          clusterGroup.addLayer(entry.marker);
        } else if (!visible && inCluster) {
          clusterGroup.removeLayer(entry.marker);
        }
      }
    },
  });
  map.getContainer().appendChild(filter.el);

  // Leaflet sometimes mis-measures tiles when the container was hidden when
  // init ran; expose invalidateSize so app.js can call it on view return.
  // Also clean up the filter panel when the map view is disposed so it does
  // not leak between mount/unmount cycles.
  return {
    invalidateSize() {
      map.invalidateSize(false);
    },
    dispose() {
      filter.destroy();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
