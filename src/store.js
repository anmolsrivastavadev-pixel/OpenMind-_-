import { useSyncExternalStore } from 'react';
import { createEngine } from './engine/engine.js';

// One market engine per tab. In production this becomes a WebSocket client
// that receives the same tick payloads from the backend price job.
export const engine = createEngine();

/** Re-render on every market tick / state change. */
export function useMarket() {
  useSyncExternalStore(engine.subscribe, () => engine.version);
  return engine;
}

/** Re-render once per second (countdowns). */
let sec = 0;
const secListeners = new Set();
setInterval(() => {
  sec++;
  secListeners.forEach((f) => f());
}, 1000);
export function useSecond() {
  return useSyncExternalStore(
    (f) => (secListeners.add(f), () => secListeners.delete(f)),
    () => sec,
  );
}
