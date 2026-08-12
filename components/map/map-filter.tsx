// Floating equipment-type filter panel for the map view (v4 React port of
// js/map-filter.js).
//
// Lets the user toggle which equipment types are visible. The map view wires
// up `onToggle` per checkbox and `onSelectAll`/`onSelectNone` for the action
// buttons; the panel itself is presentational and stateless w.r.t. the
// enabled set — the parent (MapView) owns `enabledTypes` and reacts to
// changes by adding/removing markers (OR semantic).
//
// All styling is inline so this component is self-contained.

'use client';

import type { CSSProperties, MouseEvent } from 'react';

import { EQUIPMENT_TYPES, type EquipmentType } from '@/lib/store';

export interface MapFilterProps {
  counts: Record<EquipmentType, number>;
  enabledTypes: Set<EquipmentType>;
  onToggle: (t: EquipmentType) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

const PANEL_STYLE: CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 10,
  zIndex: 1000,
  width: 180,
  background: '#ffffff',
  color: '#1f2329',
  border: '1px solid #e2e5ea',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
  padding: '10px 12px',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontSize: 13,
  lineHeight: 1.4,
  boxSizing: 'border-box',
};

const TITLE_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: '#1f2329',
  marginBottom: 8,
  paddingBottom: 6,
  borderBottom: '1px solid #e2e5ea',
};

const ROW_BASE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 2px',
  cursor: 'pointer',
  borderRadius: 3,
};

const NAME_STYLE: CSSProperties = {
  flex: '1 1 auto',
  color: '#1f2329',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const COUNT_STYLE: CSSProperties = {
  flex: '0 0 auto',
  fontFamily: 'SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 12,
  color: '#5b6470',
  fontWeight: 600,
};

const ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
  paddingTop: 8,
  borderTop: '1px solid #e2e5ea',
};

const ACTION_BTN_STYLE: CSSProperties = {
  flex: '1 1 50%',
  font: 'inherit',
  fontSize: 12,
  color: '#2b6cb0',
  background: '#ebf2fb',
  border: '1px solid #cfe0f3',
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
};

function Row({
  type,
  count,
  checked,
  onToggle,
}: {
  type: EquipmentType;
  count: number;
  checked: boolean;
  onToggle: (t: EquipmentType) => void;
}) {
  const onEnter = (e: MouseEvent<HTMLLabelElement>) => {
    e.currentTarget.style.background = '#ebf2fb';
  };
  const onLeave = (e: MouseEvent<HTMLLabelElement>) => {
    e.currentTarget.style.background = '';
  };

  return (
    <label
      style={ROW_BASE_STYLE}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <input
        type="checkbox"
        data-type={type}
        checked={checked}
        onChange={() => onToggle(type)}
        style={{ margin: 0, cursor: 'pointer' }}
      />
      <span style={NAME_STYLE}>{type}</span>
      <span style={COUNT_STYLE}>{count}</span>
    </label>
  );
}

function ActionBtn({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const onEnter = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#dcebfa';
  };
  const onLeave = (e: MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = '#ebf2fb';
  };
  return (
    <button
      type="button"
      data-action={label === '全选' ? 'all' : 'none'}
      style={ACTION_BTN_STYLE}
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {label}
    </button>
  );
}

export function MapFilter({
  counts,
  enabledTypes,
  onToggle,
  onSelectAll,
  onSelectNone,
}: MapFilterProps) {
  return (
    <div className="map-filter" style={PANEL_STYLE}>
      <div className="map-filter__title" style={TITLE_STYLE}>
        设备类型筛选
      </div>
      {EQUIPMENT_TYPES.map((t) => (
        <Row
          key={t}
          type={t}
          count={counts[t] ?? 0}
          checked={enabledTypes.has(t)}
          onToggle={onToggle}
        />
      ))}
      <div className="map-filter__actions" style={ACTIONS_STYLE}>
        <ActionBtn label="全选" onClick={onSelectAll} />
        <ActionBtn label="清空" onClick={onSelectNone} />
      </div>
    </div>
  );
}