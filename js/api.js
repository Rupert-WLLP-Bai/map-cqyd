// js/api.js
//
// Thin fetch wrapper over the mock backend (server/routes/buildings.js).
// Same origin as the page — the Express app serves both the static files and
// /api, so relative paths are enough.
//
//   GET /api/buildings      -> [{ id, name, lng, lat, address,
//                                 floorCount, cableCount }, ...]
//   GET /api/buildings/:id  -> { ...same..., floors: [{ floorNo, label,
//                                 cables: [...] }] }
//                           -> 404 { error: 'not found', id }
//
// Every failure (network down, non-2xx, junk body) surfaces as an ApiError so
// callers only need one catch. ES module. No build step, no deps.

const API_BASE = '/api';

/** Error for any failed API call. `status` is the HTTP code, or 0 if the
 *  request never reached the server (offline, DNS, CORS, aborted). */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * GET `path` and parse the JSON body.
 * @param {string} path - absolute path on this origin, e.g. '/api/buildings'
 * @returns {Promise<any>} parsed JSON
 * @throws {ApiError}
 */
async function getJson(path) {
  let res;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } });
  } catch (_) {
    // fetch only rejects when the request never completed.
    throw new ApiError(0, '无法连接服务器,请确认后端已启动');
  }

  if (!res.ok) {
    throw new ApiError(res.status, await errorMessageFor(res));
  }

  try {
    return await res.json();
  } catch (_) {
    throw new ApiError(res.status, '服务器返回了无法解析的数据');
  }
}

// Prefer the server's own `{ error }` field; fall back to the status line.
async function errorMessageFor(res) {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error) {
      return `${body.error} (HTTP ${res.status})`;
    }
  } catch (_) { /* body absent or not JSON — fall through */ }
  return `请求失败 (HTTP ${res.status})`;
}

/**
 * All buildings, without floor/cable detail.
 * @returns {Promise<Array<object>>}
 * @throws {ApiError}
 */
export async function fetchBuildings() {
  const list = await getJson(`${API_BASE}/buildings`);
  if (!Array.isArray(list)) {
    throw new ApiError(200, '楼宇列表格式不正确');
  }
  return list;
}

/**
 * One building with its floors and cables.
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {ApiError} status 404 when the id is unknown
 */
export async function fetchBuilding(id) {
  return getJson(`${API_BASE}/buildings/${encodeURIComponent(id)}`);
}

// --- toast ----------------------------------------------------------------

const TOAST_MS = 3000;

const TOAST_BORDER = {
  error: '#f87171', // red-400
  info: '#60a5fa',  // blue-400
};

let toastEl = null;
let toastTimer = null;

/**
 * Show a fixed top-center message. A second call while one is showing reuses
 * the same node (replacing its text) and restarts the 3 s timer.
 *
 * @param {string} msg
 * @param {'error'|'info'} [kind='error']
 */
export function showToast(msg, kind = 'error') {
  if (!toastEl || !toastEl.isConnected) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    // Inline styles on purpose: api.js must not depend on css/styles.css.
    Object.assign(toastEl.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      // above Leaflet's panes (400) and controls (1000).
      zIndex: '10000',
      maxWidth: '80vw',
      padding: '10px 18px',
      borderRadius: '6px',
      background: '#1f2430',
      color: '#f2f4f8',
      border: '1px solid',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
      font: '14px/1.4 system-ui, -apple-system, "PingFang SC", sans-serif',
      // purely informational — never swallow a click meant for the map.
      pointerEvents: 'none',
    });
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = String(msg);
  toastEl.style.borderColor = TOAST_BORDER[kind] || TOAST_BORDER.error;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.remove();
    toastEl = null;
    toastTimer = null;
  }, TOAST_MS);
}
