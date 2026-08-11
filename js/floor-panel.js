// js/floor-panel.js
//
// Renders ONE floor's cables GROUPED BY facade direction (东/南/西/北).
// Each direction is a collapsible group (`.dir-group`): the header shows the
// direction name + per-direction 接入/接出 counts; the group is COLLAPSED by
// default, so a floor's 15+ cables are never shown as a flat list. Clicking
// the header expands that one direction to reveal its cable table.
//
// Returns { highlightDirection(dir) } so the 3D facade selection can drive
// the list: it marks + scrolls to the matching group (and expands it so its
// cables are visible), or clears when dir is null.
//
// Canned data only. No backend, no fetch. ES module.

import { DIRECTIONS, DIRECTION_ZH } from './data.js';

// --- small DOM helper -----------------------------------------------------
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// --- grouping / counting --------------------------------------------------
function groupByDirection(cables) {
  // Always produce all four directions in canonical order so the layout is
  // stable and highlight always has a target, even for an empty direction.
  const map = { Dong: [], Nan: [], Xi: [], Bei: [] };
  for (const c of cables || []) {
    if (map[c.direction]) map[c.direction].push(c);
  }
  return map;
}

function ioCounts(list) {
  let i = 0;
  let o = 0;
  for (const c of list) {
    if (c.io === 'in') i += 1;
    else o += 1;
  }
  return { in: i, out: o };
}

// --- cable detail table ---------------------------------------------------
function renderCableTable(cables) {
  const table = h('table', 'cable-table');

  const thead = h('thead');
  const headRow = h('tr');
  headRow.append(
    h('th', null, '线缆名称'),
    h('th', null, '进出'),
    h('th', null, '对端'),
    h('th', null, '类型'),
    h('th', null, '芯数'),
  );
  thead.append(headRow);

  const tbody = h('tbody');
  for (const c of cables) {
    const tr = h('tr');
    const ioCls = c.io === 'in' ? 'io-in' : 'io-out';
    const ioLabel = c.io === 'in' ? '接入' : '接出';
    tr.append(
      h('td', null, c.name),
      h('td', ioCls, ioLabel),
      h('td', null, c.peer),
      h('td', null, c.type),
      h('td', null, String(c.cores)),
    );
    tbody.append(tr);
  }

  table.append(thead, tbody);
  return table;
}

// --- one direction group --------------------------------------------------
// `onSelect(dir)` is an optional notification fired when the header is
// activated (click / Enter / Space). It does NOT replace the internal
// open/close toggle; it lets a parent (building-view) sync the 3D facade
// selection bidirectionally. May be omitted for standalone use.
function renderDirectionGroup(dir, cables, onSelect) {
  const { in: inN, out: outN } = ioCounts(cables);

  const group = h('div', 'dir-group');
  group.dataset.dir = dir;

  // Header: direction name + in/out counts + chevron. Clickable + keyboardable.
  const header = h('div', 'dir-group__header');
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', 'false');
  header.setAttribute('aria-label',
    `${DIRECTION_ZH[dir]}方向，接入 ${inN}，接出 ${outN}`);

  const dirName = h('span', 'dir-group__dir', DIRECTION_ZH[dir]);

  const counts = h('span', 'dir-group__counts');
  counts.append(
    h('span', 'dir-group__count count--in', `接入 ${inN}`),
    h('span', 'dir-group__count count--out', `接出 ${outN}`),
  );

  const chev = h('span', 'dir-group__chev', '▸');

  header.append(dirName, counts, chev);

  // Detail: the cable table for this direction. Hidden until expanded.
  const detail = h('div', 'dir-group__detail');
  detail.append(renderCableTable(cables));

  group.append(header, detail);

  const setOpen = (open) => {
    group.classList.toggle('is-open', open);
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const toggle = () => setOpen(!group.classList.contains('is-open'));

  // Notify parent (if wired) so the 3D facade highlight can follow this
  // direction selection. Fired alongside the internal toggle, never instead
  // of it, so the panel stays usable standalone when no callback is given.
  const notify = () => { if (typeof onSelect === 'function') onSelect(dir); };

  header.addEventListener('click', () => { toggle(); notify(); });
  header.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      toggle();
      notify();
    }
  });

  return { group, header, setOpen, toggle };
}

// --- public API -----------------------------------------------------------
// renderFloorPanel(container, floor, onSelectDirection?)
//   onSelectDirection(dir) optional: fired when a direction group header is
//   activated, so building-view can sync the 3D facade highlight. The panel's
//   own open/close toggle still runs independently.
export function renderFloorPanel(container, floor, onSelectDirection) {
  // No-op safe return if there's nothing to render into.
  if (!container) return { highlightDirection() {} };

  // Fresh render each call: clear any previous content.
  container.replaceChildren();

  const grouped = groupByDirection(floor && floor.cables);
  const root = h('div', 'floor-panel__inner');

  const groups = {};
  for (const dir of DIRECTIONS) {
    const built = renderDirectionGroup(dir, grouped[dir], onSelectDirection);
    groups[dir] = built;
    root.append(built.group);
  }
  container.append(root);

  // Clear any highlight styling applied to all groups.
  const clearHighlight = () => {
    for (const dir of DIRECTIONS) {
      const g = groups[dir].group;
      g.style.borderColor = '';
      g.style.backgroundColor = '';
    }
  };

  // Marks + scrolls to the matching group so the 3D facade selection can
  // drive the list. null clears. Inline styles reference the CSS vars already
  // defined in styles.css (--accent / --accent-soft) so this module needs no
  // CSS file of its own.
  const highlightDirection = (dir) => {
    clearHighlight();
    if (!dir || !groups[dir]) return;
    const g = groups[dir].group;
    g.style.borderColor = 'var(--accent)';
    g.style.backgroundColor = 'var(--accent-soft)';
    groups[dir].setOpen(true); // ensure the selected facade's cables are visible
    g.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return { highlightDirection };
}
