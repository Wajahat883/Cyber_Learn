import { useSyncExternalStore } from 'react';
import type { ClockState, PresentationClock } from './clock';

/** Subscribes to a derived value of the clock; re-renders only when that value changes. */
export function useClockValue<T>(clock: PresentationClock, select: (s: ClockState) => T): T {
  return useSyncExternalStore(clock.subscribe, () => select(clock.getSnapshot()));
}
