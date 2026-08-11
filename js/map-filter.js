// js/map-filter.js
// Floating equipment-type filter panel for the map view.
//
// Lets the user toggle which equipment types are visible. The map view wires
// up an `onChange` callback that recomputes marker visibility: a building is
// shown when any of its equipmentTypes intersects the enabled set (OR semantic,
// per the v3 spec).
//
// All styling is inline so map-filter.js is self-contained — css/styles.css
// only contributes an anchor rule for `.map-filter` itself (z-index + position).
// ES module.

const TYPES = ['一级配电箱', '二级配电箱', 'OTN', '光交'];

/**
 * Build the equipment-type filter panel.
 *
 * @param {object}   opts
 * @param {object}   opts.counts        - { '一级配电箱': N, ... } per-type building counts.
 * @param {Set}      [opts.initialEnabled] - initially enabled type names (default = all TYPES).
 * @param {(enabled: Set<string>) => void} opts.onChange - fired on every toggle with the new enabled set.
 * @returns {{ el: HTMLElement, setEnabled: (set: Set<string>) => void, destroy: () => void }}
 */
export function createMapFilter({ counts, initialEnabled, onChange }) {
  const enabled = new Set(
    initialEnabled && initialEnabled.size > 0 ? initialEnabled : TYPES,
  );

  const el = document.createElement('div');
  el.className = 'map-filter';
  // Anchor the panel; child spacing/colors are inline so js owns the look.
  el.style.cssText = [
    'position: absolute',
    'top: 10px',
    'left: 10px',
    'z-index: 1000',
    'width: 180px',
    'background: #ffffff',
    'color: #1f2329',
    'border: 1px solid #e2e5ea',
    'border-radius: 6px',
    'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12)',
    'padding: 10px 12px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    'font-size: 13px',
    'line-height: 1.4',
    'box-sizing: border-box',
  ].join('; ');

  // Title
  const title = document.createElement('div');
  title.className = 'map-filter__title';
  title.textContent = '设备类型筛选';
  title.style.cssText = [
    'font-weight: 600',
    'font-size: 14px',
    'color: #1f2329',
    'margin-bottom: 8px',
    'padding-bottom: 6px',
    'border-bottom: 1px solid #e2e5ea',
  ].join('; ');
  el.appendChild(title);

  // Checkbox rows
  const checkboxes = [];
  for (const type of TYPES) {
    const row = document.createElement('label');
    row.className = 'map-filter__row';
    row.style.cssText = [
      'display: flex',
      'align-items: center',
      'gap: 6px',
      'padding: 4px 2px',
      'cursor: pointer',
      'border-radius: 3px',
    ].join('; ');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.type = type;
    cb.checked = enabled.has(type);
    cb.style.cssText = 'margin: 0; cursor: pointer;';
    cb.addEventListener('change', () => {
      if (cb.checked) enabled.add(type);
      else enabled.delete(type);
      onChange(new Set(enabled));
    });

    const name = document.createElement('span');
    name.className = 'map-filter__name';
    name.textContent = type;
    name.style.cssText = [
      'flex: 1 1 auto',
      'color: #1f2329',
      'white-space: nowrap',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join('; ');

    const count = document.createElement('span');
    count.className = 'map-filter__count';
    count.textContent = String(counts[type] ?? 0);
    count.style.cssText = [
      'flex: 0 0 auto',
      'font-family: SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      'font-size: 12px',
      'color: #5b6470',
      'font-weight: 600',
    ].join('; ');

    row.addEventListener('mouseenter', () => {
      row.style.background = '#ebf2fb';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });

    row.appendChild(cb);
    row.appendChild(name);
    row.appendChild(count);
    el.appendChild(row);
    checkboxes.push(cb);
  }

  // Action buttons: 全选 / 清空
  const actions = document.createElement('div');
  actions.className = 'map-filter__actions';
  actions.style.cssText = [
    'display: flex',
    'gap: 6px',
    'margin-top: 8px',
    'padding-top: 8px',
    'border-top: 1px solid #e2e5ea',
  ].join('; ');

  function makeActionBtn(label, hoverColor) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = label === '全选' ? 'all' : 'none';
    b.textContent = label;
    b.style.cssText = [
      'flex: 1 1 50%',
      'font: inherit',
      'font-size: 12px',
      'color: #2b6cb0',
      'background: #ebf2fb',
      'border: 1px solid #cfe0f3',
      'border-radius: 4px',
      'padding: 4px 8px',
      'cursor: pointer',
    ].join('; ');
    b.addEventListener('mouseenter', () => {
      b.style.background = '#dcebfa';
    });
    b.addEventListener('mouseleave', () => {
      b.style.background = '#ebf2fb';
    });
    return b;
  }

  const btnAll = makeActionBtn('全选');
  btnAll.addEventListener('click', () => {
    for (const t of TYPES) enabled.add(t);
    syncCheckboxes();
    onChange(new Set(enabled));
  });

  const btnNone = makeActionBtn('清空');
  btnNone.addEventListener('click', () => {
    enabled.clear();
    syncCheckboxes();
    onChange(new Set(enabled));
  });

  actions.appendChild(btnAll);
  actions.appendChild(btnNone);
  el.appendChild(actions);

  function syncCheckboxes() {
    for (const cb of checkboxes) {
      const t = cb.dataset.type;
      cb.checked = enabled.has(t);
    }
  }

  function setEnabled(set) {
    enabled.clear();
    for (const t of set) enabled.add(t);
    syncCheckboxes();
  }

  function destroy() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  return { el, setEnabled, destroy };
}
