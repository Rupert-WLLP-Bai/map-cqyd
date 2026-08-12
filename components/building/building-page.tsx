'use client';

// Building view container: topbar + (floor pager | floor panel) on the left,
// Three.js scene on the right. Wires the Zustand store to the imperative
// initBuilding3D / renderFloorPanel handles so that clicking a 3D slab or
// a bundle marker jumps the floor + direction, and the pager / dropdown
// re-render the panel and the 3D scene's active floor.
//
// Layout matches the v3 spec: bld-left 60% / bld-right 40% split. The
// floor pager + floor panel live on the left; the 3D mount on the right.
//
// building-3d.tsx is a 'use client' module that exports an imperative
// initBuilding3D(container, building, opts) function. We call it from a
// useEffect and store the returned handle in a ref; floorNo / direction
// changes from the store are pushed through setActiveFloor /
// setActiveDirection on the live handle.

import { useEffect, useRef } from 'react';

import { useViewStore } from '@/lib/store';
import { useBuilding } from '@/lib/api';

import { FloorSelector } from './floor-selector';
import {
  initBuilding3D,
  type Building3DHandle,
} from './building-3d';
import {
  renderFloorPanel,
  type FloorPanelHandle,
} from './floor-panel';

import type { Direction } from '@/lib/types';

export function BuildingPage() {
  const buildingId = useViewStore((s) => s.buildingId);
  const floorNo = useViewStore((s) => s.floorNo);
  const direction = useViewStore((s) => s.direction);
  const setFloor = useViewStore((s) => s.setFloor);
  const setDirection = useViewStore((s) => s.setDirection);
  const exitBuilding = useViewStore((s) => s.exitBuilding);

  const { data: building, isLoading, error } = useBuilding(buildingId);

  // --- 3D scene mount (imperative) -------------------------------------
  const threeMountRef = useRef<HTMLDivElement | null>(null);
  const threeRef = useRef<Building3DHandle | null>(null);

  useEffect(() => {
    if (!building || !threeMountRef.current) return;
    const mount = threeMountRef.current;
    const handle = initBuilding3D(mount, building, {
      onSelectFloor: (fn) => setFloor(fn),
      onSelectBundle: (fn, dir) => {
        setFloor(fn);
        setDirection(dir);
      },
    });
    threeRef.current = handle;
    // initial sync — store likely has floorNo=1 (or whatever enterBuilding set)
    const s = useViewStore.getState();
    handle.setActiveFloor(s.floorNo);
    handle.setActiveDirection(s.direction);
    return () => {
      handle.dispose();
      threeRef.current = null;
    };
    // The 3D scene is built once per building identity; subsequent floor
    // changes are pushed through setActiveFloor below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building?.id]);

  // Push floorNo / direction changes from the store into the live 3D handle.
  useEffect(() => {
    threeRef.current?.setActiveFloor(floorNo);
  }, [floorNo]);
  useEffect(() => {
    threeRef.current?.setActiveDirection(direction);
  }, [direction]);

  // --- floor panel mount (imperative) ----------------------------------
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!building || !panelRef.current) return;
    const container = panelRef.current;
    const floor =
      building.floors.find((f) => f.floorNo === floorNo) ||
      building.floors[0] ||
      null;
    if (!floor) return;

    const rooms = Array.isArray(building.rooms)
      ? building.rooms.filter((r) => r && r.floorNo === floor.floorNo)
      : [];
    const equipment = Array.isArray(building.equipment)
      ? building.equipment.filter((e) => e && e.floorNo === floor.floorNo)
      : [];

    renderFloorPanel(container, floor, { rooms, equipment });
  }, [building, floorNo]);

  if (!buildingId) return null;

  if (isLoading) {
    return (
      <div className="bld-topbar">
        <span className="bld-name">加载中…</span>
        <button type="button" className="btn-back" onClick={exitBuilding}>
          ← 返回地图
        </button>
      </div>
    );
  }
  if (error || !building) {
    return (
      <div className="bld-topbar">
        <span className="bld-name">未找到楼宇数据</span>
        <button type="button" className="btn-back" onClick={exitBuilding}>
          ← 返回地图
        </button>
      </div>
    );
  }

  return (
    <section className="view--building" aria-label="楼宇内部视图">
      <header className="bld-topbar">
        <span className="bld-name">{building.name}</span>
        <button type="button" className="btn-back" onClick={exitBuilding}>
          ← 返回地图
        </button>
      </header>

      <div className="bld-body">
        <div className="bld-left">
          <FloorSelector floors={building.floors} />
          <div className="floor-panel" ref={panelRef} />
        </div>

        <div className="bld-right">
          <div className="b3d-mount" ref={threeMountRef} aria-label="楼宇三维线框" />
        </div>
      </div>
    </section>
  );
}

// Direction type re-export for callers that wire the bundle-click handler.
export type { Direction };
