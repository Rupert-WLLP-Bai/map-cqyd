// js/floor-panel.js
//
// Renders ONE floor's EQUIPMENT as a flat list (with a top filter bar).
// v3 spec: cables are no longer rendered at all — the building interior panel
// shows 一级配电箱 + 二级配电箱 rows (OTN / 光交 stay 3D-only).
//
//   renderFloorPanel(container, floor, opts?)
//     floor = { floorNo, label }
//     opts  = { rooms: Room[], equipment: Equipment[] }
//       both arrays are pre-filtered by the caller to this floorNo.
//       rooms is needed to look up the room name per equipment row;
//       equipment supplies the rows themselves.
//
//   Return value:
//     {
//       highlightRoom(roomId | null),
//       setFilter({ type, onlyAbnormal }),
//       getFilter()
//     }
//
//   Layout (matches docs/.../2026-08-11-map-cqyd-v3-design.md):
//     ┌─ floor-panel__inner ──────────────────┐
//     │ floor header                          │
//     │ filter bar: [全部][一级][二级]   □仅异常 │
//     │ ┌─ .eq-floor-card ──────────────────┐ │
//     │ │ [一级] 一级配电箱-001 · 主设备间 ● online │
//     │ │ [二级] 二级配电箱-014 · 主设备间 ○ offline│
//     │ └────────────────────────────────────┘ │
//     │ 共 N 条                                 │
//     └────────────────────────────────────────┘

// --- small DOM helper -----------------------------------------------------
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Equipment types we render in the v3 panel. OTN / 光交 stay 3D-only per spec.
const RENDERED_TYPES = new Set(['一级配电箱', '二级配电箱']);

// Short Chinese label for the type badge; "一级" / "二级" per spec.
const TYPE_BADGE_LABEL = {
  '一级配电箱': '一级',
  '二级配电箱': '二级',
};

// Filter-bar button labels (in display order).
const TYPE_FILTERS = ['全部', '一级', '二级'];

// Map a filter-bar button value to a predicate over equipment.type.
function typePredicateFor(filterType) {
  if (filterType === '一级' || filterType === '一级配电箱') {
    return (eq) => eq.type === '一级配电箱';
  }
  if (filterType === '二级' || filterType === '二级配电箱') {
    return (eq) => eq.type === '二级配电箱';
  }
  return () => true; // '全部' and anything else
}

// --- row rendering --------------------------------------------------------
function equipmentRow(eq, roomName) {
  const row = h('div', 'eq-row');
  row.dataset.equipmentId = eq.id;
  if (eq.roomId != null) row.dataset.roomId = String(eq.roomId);

  const badge = h('span',
    `eq-type-badge eq-type-badge--${TYPE_BADGE_LABEL[eq.type] || 'unknown'}`,
    TYPE_BADGE_LABEL[eq.type] || eq.type || '');
  const name = h('span', 'eq-row__name', eq.name || eq.id || '');
  const room = h('span', 'eq-row__room', roomName || '—');

  const statusCls = `eq-status eq-status--${eq.status || 'unknown'}`;
  const statusText = eq.status === 'online' ? 'online'
                   : eq.status === 'offline' ? 'offline'
                   : (eq.status || 'unknown');
  const status = h('span', statusCls, statusText);

  row.append(badge, name, room, status);
  return row;
}

// --- public API -----------------------------------------------------------
export function renderFloorPanel(container, floor, opts) {
  if (!container) {
    // No-op safe return so callers can wire the panel handle unconditionally.
    return {
      highlightRoom() {},
      setFilter() {},
      getFilter() { return { type: '全部', onlyAbnormal: false }; },
    };
  }

  // Fresh render each call: clear any previous content.
  container.replaceChildren();

  const optsSafe = opts || {};
  const rooms = Array.isArray(optsSafe.rooms) ? optsSafe.rooms : [];
  const equipment = Array.isArray(optsSafe.equipment) ? optsSafe.equipment : [];

  // Build a roomId -> room-name lookup so each row can label its room.
  const roomNameById = new Map();
  for (const r of rooms) {
    if (r && r.id != null) roomNameById.set(r.id, r.name || '');
  }

  // Pre-filter to types the v3 panel actually renders (drops OTN/光交).
  const renderable = equipment.filter((eq) => eq && RENDERED_TYPES.has(eq.type));

  // --- filter state -----------------------------------------------------
  // `type` is the button label ('全部' | '一级' | '二级'); `onlyAbnormal`
  // mirrors the checkbox. Mutating either re-renders the list rows only —
  // the filter bar itself stays put so the user's selection is preserved.
  const filterState = { type: '全部', onlyAbnormal: false };
  const typePred = () => typePredicateFor(filterState.type);

  // --- root layout ------------------------------------------------------
  const root = h('div', 'floor-panel__inner');

  // Floor header — mirrors what the pager shows, but inline above the list.
  const header = h('div', 'floor-panel__header');
  header.textContent = floor && floor.label ? `楼层 ${floor.label}` : '楼层';
  root.append(header);

  // Filter bar.
  const filterBar = h('div', 'eq-filter-bar');

  const typeButtons = TYPE_FILTERS.map((label) => {
    const btn = h('button',
      `eq-filter-bar__type${label === filterState.type ? ' is-active' : ''}`,
      label);
    btn.type = 'button';
    btn.dataset.filterType = label;
    btn.addEventListener('click', () => {
      if (filterState.type === label) return;
      filterState.type = label;
      // Update active class on all buttons without rebuilding.
      for (const b of typeButtons) {
        b.classList.toggle('is-active', b.dataset.filterType === label);
      }
      rerenderList();
    });
    return btn;
  });
  for (const b of typeButtons) filterBar.append(b);

  // Only-abnormal checkbox.
  const abnormalWrap = h('label', 'eq-filter-bar__abnormal');
  const abnormalBox = h('input', 'eq-filter-bar__checkbox');
  abnormalBox.type = 'checkbox';
  abnormalBox.addEventListener('change', () => {
    filterState.onlyAbnormal = abnormalBox.checked;
    rerenderList();
  });
  abnormalWrap.append(abnormalBox, document.createTextNode('仅异常'));
  filterBar.append(abnormalWrap);

  root.append(filterBar);

  // --- list card + total line ------------------------------------------
  const card = h('div', 'eq-floor-card');
  const list = h('div', 'eq-floor-card__list');
  card.append(list);
  root.append(card);

  const total = h('div', 'eq-total');
  root.append(total);

  container.append(root);

  // --- list painting ----------------------------------------------------
  function applyFilters(src) {
    const tp = typePred();
    return src.filter((eq) => {
      if (!tp(eq)) return false;
      if (filterState.onlyAbnormal && eq.status !== 'offline') return false;
      return true;
    });
  }

  // --- highlight --------------------------------------------------------
  // Marks + scrolls to the first row whose roomId matches. null clears.
  // We re-apply highlight on every list repaint so the highlight survives
  // filter changes that still include the room.
  let activeRoomId = null;

  function applyHighlight() {
    const rows = list.querySelectorAll('.eq-row');
    rows.forEach((r) => r.classList.remove('is-room-highlight'));
    if (activeRoomId == null) return;
    for (const r of rows) {
      if (r.dataset.roomId === String(activeRoomId)) {
        r.classList.add('is-room-highlight');
        r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
    }
  }

  // Repaint the filtered rows + total + re-apply any active room highlight.
  const rerenderList = () => {
    const filtered = applyFilters(renderable);
    list.replaceChildren();
    if (filtered.length === 0) {
      list.append(h('div', 'eq-empty', '本层暂无符合条件的设备'));
    } else {
      const frag = document.createDocumentFragment();
      for (const eq of filtered) {
        const roomName = eq.roomId != null
          ? roomNameById.get(eq.roomId)
          : '';
        frag.append(equipmentRow(eq, roomName));
      }
      list.append(frag);
    }
    total.textContent = `共 ${filtered.length} 条`;
    applyHighlight();
  };

  // First paint.
  rerenderList();

  // --- public return ----------------------------------------------------
  return {
    highlightRoom(roomId) {
      activeRoomId = roomId == null ? null : roomId;
      applyHighlight();
    },
    setFilter(next) {
      if (!next || typeof next !== 'object') return;
      if (typeof next.type === 'string' && next.type !== filterState.type) {
        filterState.type = next.type;
        for (const b of typeButtons) {
          b.classList.toggle('is-active', b.dataset.filterType === next.type);
        }
      }
      if (typeof next.onlyAbnormal === 'boolean'
          && next.onlyAbnormal !== filterState.onlyAbnormal) {
        filterState.onlyAbnormal = next.onlyAbnormal;
        abnormalBox.checked = next.onlyAbnormal;
      }
      rerenderList();
    },
    getFilter() {
      return { type: filterState.type, onlyAbnormal: filterState.onlyAbnormal };
    },
  };
}