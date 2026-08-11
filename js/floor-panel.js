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
// An expanded group virtualizes its cable table (fixed 28px rows, only the
// visible slice in the DOM) so a 200+ cable 设备间 direction stays smooth.
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

// --- cable detail table (virtualized) -------------------------------------
// A dense "设备间" direction can hold 200+ cables, and four groups per floor
// meant we were building thousands of <tr> nobody scrolls to. Instead the
// tbody renders only the rows in view: fixed 28px rows let us map scrollTop
// straight to an index range, and two padding rows above/below hold the
// scrollbar at its true full height.
const ROW_H = 28;      // must match .cable-row height in styles.css
const ROW_BUFFER = 6;  // extra rows rendered off-screen each side
const DENSE_AT = 200;  // '共 N 条' gets the dense tint past this

function cableHead() {
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
  return thead;
}

function cableRow(c) {
  const tr = h('tr', 'cable-row');
  const ioCls = c.io === 'in' ? 'io-in' : 'io-out';
  const ioLabel = c.io === 'in' ? '接入' : '接出';
  tr.append(
    h('td', null, c.name),
    h('td', ioCls, ioLabel),
    h('td', null, c.peer),
    h('td', null, c.type),
    h('td', null, String(c.cores)),
  );
  return tr;
}

// A spacer row whose only job is to occupy `n * ROW_H` px. It carries a real
// <td colspan> because a cell-less <tr> does not reliably take a height.
function padRow() {
  const tr = h('tr', 'cable-pad');
  const td = h('td');
  td.colSpan = 5;
  tr.append(td);
  return tr;
}

/**
 * Build the scroll container + virtualized table for one direction's cables.
 * Returns { el, refresh } — call refresh() after the element becomes visible
 * so the first slice is measured against a real clientHeight.
 */
function renderCableTable(cables) {
  const rows = cables || [];

  const scroll = h('div', 'cable-tbody-scroll');
  const table = h('table', 'cable-table');
  const tbody = h('tbody');
  const padTop = padRow();
  const padBot = padRow();
  table.append(cableHead(), tbody);
  scroll.append(table);

  let firstRendered = -1;
  let lastRendered = -1;
  let frame = 0;

  const paint = (force) => {
    // Before the group opens the container has no height; fall back to a
    // screenful so the first paint is never empty.
    const viewH = scroll.clientHeight || ROW_H * 20;
    const top = scroll.scrollTop;
    const first = Math.max(0, Math.floor(top / ROW_H) - ROW_BUFFER);
    const last = Math.min(rows.length - 1,
      Math.ceil((top + viewH) / ROW_H) + ROW_BUFFER);

    if (!force && first === firstRendered && last === lastRendered) return;
    firstRendered = first;
    lastRendered = last;

    padTop.firstChild.style.height = `${first * ROW_H}px`;
    padBot.firstChild.style.height =
      `${Math.max(0, rows.length - 1 - last) * ROW_H}px`;

    const frag = document.createDocumentFragment();
    frag.append(padTop);
    for (let i = first; i <= last; i += 1) frag.append(cableRow(rows[i]));
    frag.append(padBot);
    tbody.replaceChildren(frag);
  };

  // One re-slice per animation frame at most; scroll fires far faster.
  scroll.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint(false);
    });
  });

  const wrap = h('div', 'cable-table-wrap');
  const total = h('div', 'cable-total', `共 ${rows.length} 条`);
  if (rows.length > DENSE_AT) total.classList.add('is-dense');
  wrap.append(scroll, total);

  paint(true);

  return {
    el: wrap,
    refresh() {
      paint(true);
    },
  };
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

  // Detail: the cable table for this direction. Hidden until expanded, and
  // not even built until then — a collapsed group shows counts only, so there
  // is nothing to render and nothing to measure.
  const detail = h('div', 'dir-group__detail');
  let table = null;

  group.append(header, detail);

  const setOpen = (open) => {
    group.classList.toggle('is-open', open);
    header.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    if (!table) {
      table = renderCableTable(cables);
      detail.append(table.el);
    }
    // Now that the detail is displayed the scroll container has a real
    // height, so re-slice against it.
    table.refresh();
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
