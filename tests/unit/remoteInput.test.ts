import { describe, expect, it } from 'vitest';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { checkedPlayer, checkedScene, MAX_REMOTE_MAP_SIDE } from '../../src/app/remote-view/remoteInput';
import { remoteScene } from './remoteSceneFixtures';

const player = (fields: Record<string, unknown> = {}): unknown => ({
  movableTokenIds: ['t1'], measurement: resolveMeasurementSettings(undefined, null),
  tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} }, ...fields,
});

describe("what a remote view takes from its owner", () => {
  it('takes a well-formed scene, or null', () => {
    expect(checkedScene(null)).toBeNull();
    expect(checkedScene(remoteScene())).not.toBeNull();
  });

  it('refuses map sizes and URLs the viewport or the textures cannot take', () => {
    const bad = [
      { ...remoteScene(), background: { url: 3, width: 10, height: 10 } },
      { ...remoteScene(), background: { url: null, width: Infinity, height: 10 } },
      { ...remoteScene(), background: { url: null, width: -1, height: 10 } },
      { ...remoteScene(), background: { url: null, width: MAX_REMOTE_MAP_SIDE + 1, height: 10 } },
      { ...remoteScene(), tokenImages: { t1: 7 } },
      { ...remoteScene(), objects: { tokens: {} } },
    ];
    for (const scene of bad) expect(() => checkedScene(scene)).toThrow(/RemoteView.setScene/);
  });

  it('copies a well-formed player state, frozen', () => {
    const state = checkedPlayer(player());
    expect(Object.isFrozen(state.measurement)).toBe(true);
  });

  it('refuses a measurement the ruler cannot use, and malformed ids, definitions and health', () => {
    const measurement = resolveMeasurementSettings(undefined, null);
    const bad = [
      player({ measurement: { ...measurement, unitDistance: 0 } }),
      player({ measurement: { ...measurement, coneAngle: 720 } }),
      player({ measurement: { ...measurement, mode: 'furlongs' } }),
      player({ measurement: { ...measurement, rangeBands: [{ name: 'Near', maxSquares: Number.NaN }] } }),
      player({ movableTokenIds: [1] }),
      player({ tokenUi: { conditions: [{ id: 'x' }], resources: {} } }),
      player({ tokenUi: { conditions: [], resources: { t1: [{ key: 'hp' }] } } }),
      player({ initiative: { rules: null, health: { t1: { value: 'full', max: 1 } } } }),
    ];
    for (const state of bad) expect(() => checkedPlayer(state)).toThrow(/RemoteView.setPlayer/);
  });
});
