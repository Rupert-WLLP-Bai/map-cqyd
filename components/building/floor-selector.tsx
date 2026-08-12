'use client';

// Floor pager: prev / next buttons + a dropdown to jump to any floor.
//
// Reads the current `floorNo` from the Zustand view store and dispatches
// changes through `setFloor` + a caller-supplied `onChange` callback.
// The store holds the source of truth (the building-page watches it to
// re-render the 3D + floor panel); this component is a pure controller.

import { useViewStore } from '@/lib/store';

import type { Floor } from '@/lib/types';

export interface FloorSelectorProps {
  /** Floors available for this building. Order is significant. */
  floors: Floor[];
  /** Optional callback fired after the user picks a floor (in addition
   *  to the store update). */
  onChange?: (floorNo: number) => void;
}

export function FloorSelector({ floors, onChange }: FloorSelectorProps) {
  const floorNo = useViewStore((s) => s.floorNo);
  const setFloor = useViewStore((s) => s.setFloor);

  // Index of the current floor inside `floors`. If the store's `floorNo`
  // doesn't match any floor (e.g. after a building switch before the page
  // re-mounts), default to the first floor.
  const idx = Math.max(
    0,
    floors.findIndex((f) => f.floorNo === floorNo),
  );

  function pickFloor(nextIdx: number) {
    if (nextIdx < 0 || nextIdx >= floors.length) return;
    const fn = floors[nextIdx].floorNo;
    if (fn === floorNo) return;
    setFloor(fn);
    onChange?.(fn);
  }

  const prevDisabled = idx <= 0;
  const nextDisabled = idx >= floors.length - 1;

  return (
    <div className="floor-pager">
      <button
        type="button"
        className="pager-btn"
        disabled={prevDisabled}
        onClick={() => pickFloor(idx - 1)}
      >
        上一层
      </button>

      <select
        className="floor-select"
        value={String(idx)}
        onChange={(e) => {
          const i = Number(e.target.value);
          if (Number.isInteger(i)) pickFloor(i);
        }}
      >
        {floors.map((f, i) => (
          <option key={f.floorNo} value={String(i)}>
            {`${f.label || `${f.floorNo}F`}  ·  ${i + 1}/${floors.length}`}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="pager-btn"
        disabled={nextDisabled}
        onClick={() => pickFloor(idx + 1)}
      >
        下一层
      </button>
    </div>
  );
}
