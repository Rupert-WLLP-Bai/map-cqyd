// Building popup rendered inside Leaflet's popup DOM via renderToString.
// Minimal markup: name, address, and an "进入楼宇" button that fires
// enterBuilding(id, floorCount) on click.

'use client';

import type { CSSProperties } from 'react';

import { useViewStore } from '@/lib/store';

export interface BuildingPopupProps {
  id: string;
  name: string;
  address: string;
  floorCount: number;
}

const ROOT_STYLE: CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontSize: 13,
  lineHeight: 1.5,
  color: '#1f2329',
  minWidth: 180,
};

const NAME_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  marginBottom: 4,
};

const ADDR_STYLE: CSSProperties = {
  color: '#5b6470',
  marginBottom: 8,
  wordBreak: 'break-all',
};

const BTN_STYLE: CSSProperties = {
  display: 'inline-block',
  font: 'inherit',
  fontSize: 13,
  color: '#ffffff',
  background: '#2b6cb0',
  border: '1px solid #2b6cb0',
  borderRadius: 4,
  padding: '6px 12px',
  cursor: 'pointer',
};

export function BuildingPopup({ id, name, address, floorCount }: BuildingPopupProps) {
  const enterBuilding = useViewStore((s) => s.enterBuilding);

  return (
    <div className="bld-popup" style={ROOT_STYLE}>
      <div className="bld-popup__name" style={NAME_STYLE}>
        {name}
      </div>
      <div className="bld-popup__addr" style={ADDR_STYLE}>
        {address}
      </div>
      <button
        type="button"
        className="bld-popup__btn"
        style={BTN_STYLE}
        onClick={() => enterBuilding(id, floorCount)}
      >
        进入楼宇
      </button>
    </div>
  );
}