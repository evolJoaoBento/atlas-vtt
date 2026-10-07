import { EventEmitter } from 'events';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL: the rolls are captured where the stack would throw them.
const captured = vi.hoisted(() => ({ rolls: [] as Array<ReadonlyArray<{ scene: { lookId?: string } }>> }));
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
  warmStages: (): void => undefined,
}));
vi.mock('../../src/app/react/components/dice3d/DiceRollStack', () => ({
  DiceRollStack: ({ rolls }: { rolls: ReadonlyArray<{ scene: { lookId?: string } }> }): null => {
    captured.rolls.push(rolls);
    return null;
  },
}));

import { diceColourSlot } from '../../src/app/extensions/slots';
import { DiceDropdownMenu } from '../../src/app/react/components/dice/DiceDropdownMenu';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ReadableViewStoreProvider, ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceTool } from '../../src/app/tools/DiceTool';
import { RemoteOwnRolls } from '../../src/app/remote-view/RemoteOwnRolls';
import { RemoteViewDice } from '../../src/app/remote-view/RemoteViewDice';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';

async function vault(): Promise<InMemoryApp> {
  const memory = createInMemoryApp();
  new SettingsService(memory.app).setDiceDisplay('full');
  const assets = AssetService.getInstance(memory.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP } });
  await assets.updateCollectionIndexData('source', { diceLookId: 'ext:fire' });
  return memory;
}

const storeOn = (mapPath: string): never => createStore(() => ({ mapPath })) as never;

beforeEach(() => {
  AssetService.resetInstance();
  captured.rolls = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Atlas's dice in a map view know the map's collection", () => {
  it("the tray of a map view asks the colour providers with the map's collection and shows the picker", async () => {
    const memory = await vault();
    const provider = vi.fn(() => [{ name: 'Fire', color: '#dd3333' }]);
    const remove = diceColourSlot.add('ext', provider);
    render(
      <AtlasUIContext.Provider value={{ app: memory.app, view: null, pixiApp: null, renderer: null }}>
        <ViewStoreProvider store={storeOn(MAP)}>
          <DiceDropdownMenu diceTool={{ rollDice: vi.fn() } as unknown as DiceTool} isOpen onToggle={() => undefined} />
        </ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    expect(provider).toHaveBeenCalledWith('source');
    expect(screen.getByRole('button', { name: 'Fire' })).toBeTruthy();
    remove();
  });

  it("a roll in a GM map view and in the player window is thrown in the map collection's look; elsewhere the default's", async () => {
    const memory = await vault();
    const roll = { id: 'r1', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 3, max: 20 }], modifiers: 0, total: 3, crit: null };
    const show = (wrap: (children: React.ReactElement) => React.ReactElement): string | undefined => {
      const bus = new EventEmitter();
      captured.rolls = [];
      const { unmount } = render(
        <AtlasUIContext.Provider value={{ app: memory.app, view: null, pixiApp: null, renderer: null }}>
          {wrap(<DiceRollDisplay eventBus={bus} />)}
        </AtlasUIContext.Provider>,
      );
      act(() => { bus.emit('dice-rolled', { ...roll }); });
      const lookId = captured.rolls.at(-1)?.[0]?.scene.lookId;
      unmount();
      return lookId;
    };
    expect(show((children) => <ViewStoreProvider store={storeOn(MAP)}>{children}</ViewStoreProvider>)).toBe('ext:fire');
    expect(show((children) => <ReadableViewStoreProvider store={storeOn(MAP)}>{children}</ReadableViewStoreProvider>)).toBe('ext:fire');
    SettingsService.forApp(memory.app)!.setDiceLookId('ext:wood');
    expect(show((children) => <ViewStoreProvider store={storeOn('atlas-vtt/elsewhere.atlasmap')}>{children}</ViewStoreProvider>)).toBe('ext:wood');
  });

  it("a remote view throws in the look its owner sets for the scene's collection, and in the player's own without one", async () => {
    const memory = await vault();
    const store = createStore(() => ({ remoteView: { ...initialRemoteViewState() } }));
    const dice = new RemoteViewDice(store as never);
    expect(() => dice.setDiceLook(7)).toThrow('[Atlas API] RemoteView.setDiceLook: the look must be a look id of at most 300 characters, or null.');
    render(
      <AtlasUIContext.Provider value={{ app: memory.app, view: null, pixiApp: null, renderer: null }}>
        <ViewStoreProvider store={store as never}><RemoteOwnRolls /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    const roll = (id: string): never => ({ id, timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 3, max: 20 }], modifiers: 0, total: 3, crit: null }) as never;
    act(() => dice.throwRoll(roll('r1')));
    expect(captured.rolls.at(-1)?.at(-1)?.scene.lookId).toBeUndefined();
    act(() => dice.setDiceLook('ext:fire'));
    act(() => dice.throwRoll(roll('r2')));
    expect(captured.rolls.at(-1)?.at(-1)?.scene.lookId).toBe('ext:fire');
  });
});
