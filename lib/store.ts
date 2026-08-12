// Zustand store: UI state for the map/building view router and the equipment-
// type filter panel. Server data is owned by TanStack Query (see ./api.ts);
// this store only holds view-level state (view mode, selected building, floor,
// direction, enabled equipment types).

import { create } from 'zustand';

export type EquipmentType = '一级配电箱' | '二级配电箱' | 'OTN' | '光交';
export type Direction = 'Dong' | 'Nan' | 'Xi' | 'Bei';

export interface ViewState {
  view: 'map' | 'building';
  buildingId: string | null;
  floorNo: number;
  direction: Direction | null;
  enabledTypes: Set<EquipmentType>;
}

export interface ViewActions {
  enterBuilding: (id: string, floorCount: number) => void;
  exitBuilding: () => void;
  setFloor: (n: number) => void;
  setDirection: (d: Direction | null) => void;
  toggleType: (t: EquipmentType) => void;
  setEnabledTypes: (s: Set<EquipmentType>) => void;
}

export type ViewStore = ViewState & ViewActions;

export const useViewStore = create<ViewStore>((set) => ({
  view: 'map',
  buildingId: null,
  floorNo: 1,
  direction: null,
  enabledTypes: new Set<EquipmentType>(['一级配电箱', '二级配电箱', 'OTN', '光交']),

  enterBuilding: (id, floorCount) => {
    // Clamp the floor to the building's floorCount; default to 1 on enter.
    const n = floorCount > 0 ? 1 : 1;
    void n;
    set({
      view: 'building',
      buildingId: id,
      floorNo: 1,
      direction: null,
    });
  },

  exitBuilding: () =>
    set({
      view: 'map',
      buildingId: null,
      floorNo: 1,
      direction: null,
    }),

  setFloor: (n) => set({ floorNo: n }),
  setDirection: (d) => set({ direction: d }),

  toggleType: (t) =>
    set((s) => {
      const next = new Set(s.enabledTypes);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return { enabledTypes: next };
    }),

  setEnabledTypes: (s) => set({ enabledTypes: s }),
}));

export const EQUIPMENT_TYPES: EquipmentType[] = [
  '一级配电箱',
  '二级配电箱',
  'OTN',
  '光交',
];