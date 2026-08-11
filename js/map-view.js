// js/map-view.js
// Leaflet 2D map with one marker per building. Clicking a marker (or the
// "进入楼宇" button in its popup) calls onSelectBuilding(building.id).
//
// At 1k buildings a flat marker layer is unreadable (and slow to lay out), so
// every marker goes into a Leaflet.markercluster group: low zoom shows counted
// cluster circles, zooming in splits them until individual pins appear.
//
// Uses the globals L and L.markerClusterGroup that index.html loaded via the
// Leaflet + Leaflet.markercluster CDN script tags. No build step, no npm.
// ES module.

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
  });

  map.addLayer(clusterGroup);

  // Leaflet sometimes mis-measures tiles when the container was hidden when
  // init ran; expose invalidateSize so app.js can call it on view return.
  return {
    invalidateSize() {
      map.invalidateSize(false);
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
