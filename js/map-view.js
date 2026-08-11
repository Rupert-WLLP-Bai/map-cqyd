// js/map-view.js
// Leaflet 2D map with one marker per building. Clicking a marker (or the
// "进入楼宇" button in its popup) calls onSelectBuilding(building.id).
//
// Uses the global L that index.html loaded via the Leaflet CDN script tag.
// No build step, no npm. ES module.

// CartoDB Positron raster tiles: token-free, online, clean look for a demo.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
    'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

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
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  // Fit bounds to all buildings so the demo opens framed on the data.
  const latlngs = buildings.map((b) => [b.lat, b.lng]);
  const bounds = L.latLngBounds(latlngs).pad(0.35);
  map.fitBounds(bounds, { animate: false });

  // One marker per building. Clicking the marker opens its popup; the popup
  // has a "进入楼宇" button that triggers onSelectBuilding. Clicking the
  // marker itself also triggers onSelectBuilding (per the spec: "clicking the
  // marker or button calls onSelectBuilding").
  buildings.forEach((b) => {
    const marker = L.marker([b.lat, b.lng], {
      title: b.name,
      alt: b.name,
    }).addTo(map);

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
  });

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
