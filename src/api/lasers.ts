import type { LaserHub, LocalLaserEvent, RemoteLaser } from '../app/pixi/laser/LaserHub';
import { isHexColor } from '../app/utils/hexColor';
import type { DisposerSet } from './disposers';
import type { ViewTracker } from './viewTracker';
import type { LasersApi } from './types/lasers';
import type { Disposer, Point, ViewId } from './types/common';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return typeof value === 'object' && value !== null && isFiniteNumber((value as Point).x) && isFiniteNumber((value as Point).y);
}

/** A copy Atlas's drawing can trust: the caller keeps no reference into it. Throws, saying what is wrong. */
function checkedLaser(laser: RemoteLaser): RemoteLaser {
  const { from, color, points, lifted, dt } = (laser ?? {}) as { [K in keyof RemoteLaser]?: unknown };
  if (typeof from !== 'string' || from === '') throw new Error('lasers.show: "from" must name whose laser it is.');
  if (!isHexColor(color)) throw new Error('lasers.show: "color" must be a #rrggbb colour.');
  if (typeof lifted !== 'boolean') throw new Error('lasers.show: "lifted" must be true or false.');
  if (!Array.isArray(points) || !points.every(isPoint)) {
    throw new Error('lasers.show: "points" must be a list of { x, y } numbers.');
  }
  if (dt !== undefined && !(Array.isArray(dt) && dt.every(isFiniteNumber))) throw new Error('lasers.show: "dt" must be a list of numbers.');
  return { from, color, lifted, points: points.map(({ x, y }) => ({ x, y })), ...(dt ? { dt: [...dt] } : {}) };
}

/** An extension's callback must never throw into the GM's pointer handling. */
function callGuarded(listener: (event: LocalLaserEvent) => void, event: LocalLaserEvent): void {
  try {
    listener(Object.freeze({ ...event }));
  } catch (error) {
    console.error('[Atlas API] A laser listener failed:', error);
  }
}

export function lasersApi(tracker: ViewTracker, disposers: DisposerSet): LasersApi {
  const hubOf = (viewId: ViewId): LaserHub | null => tracker.view(viewId)?.renderer?.getLaserHub?.() ?? null;
  return Object.freeze({
    onLocal: (viewId: ViewId, listener: (event: LocalLaserEvent) => void): Disposer => {
      const hub = hubOf(viewId);
      if (!hub) return disposers.add(() => undefined);
      let cancelClose: () => void = () => undefined;
      const stop = hub.onLocal((event) => callGuarded(listener, event));
      // The view going away ends the listening too, so a closed view is never retained.
      const dispose = disposers.add(() => { cancelClose(); stop(); });
      cancelClose = tracker.onClose(viewId, dispose);
      return dispose;
    },
    show: (viewId: ViewId, laser: RemoteLaser): void => {
      const checked = checkedLaser(laser);
      hubOf(viewId)?.showRemote(checked);
    },
  });
}
