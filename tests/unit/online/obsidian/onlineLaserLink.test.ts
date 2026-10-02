import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineLaserLink } from '../../../../src/app/online/obsidian/OnlineLaserLink';
import { LASER_INTERVAL_MS } from '../../../../src/app/online/tools/LaserBatcher';
import { LASER_PALETTE } from '../../../../src/app/online/tools/laserColors';
import { LaserHub } from '../../../../src/app/pixi/laser/LaserHub';

describe('OnlineLaserLink', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("sends Atlas's laser in batches and lets it go, in the player's colour", () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    const link = new OnlineLaserLink({ hub, send, color: () => LASER_PALETTE[1]!, clock: () => 0 });
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).toHaveBeenLastCalledWith([{ x: 1, y: 1 }], false, [0], LASER_PALETTE[1]);
    hub.emitLocal({ kind: 'lift' });
    vi.advanceTimersByTime(LASER_INTERVAL_MS + 1);
    expect(send).toHaveBeenLastCalledWith([], true, [], LASER_PALETTE[1]);
    link.dispose();
  });

  it('sends no colour that is not #rrggbb, so the GM gives one', () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    const link = new OnlineLaserLink({ hub, send, color: () => 'rebeccapurple', clock: () => 0 });
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).toHaveBeenLastCalledWith([{ x: 1, y: 1 }], false, [0], undefined);
    link.dispose();
  });

  it('stops listening once disposed', () => {
    const hub = new LaserHub();
    const send = vi.fn((): boolean => true);
    new OnlineLaserLink({ hub, send, color: () => LASER_PALETTE[0]! }).dispose();
    hub.emitLocal({ kind: 'point', x: 1, y: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
