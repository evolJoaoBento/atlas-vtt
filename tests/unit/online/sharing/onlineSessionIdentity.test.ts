import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionService } from '../../../../src/app/online/OnlineSessionService';
import { onlineSessionStore, resetOnlineSessionStore } from '../../../../src/app/online/onlineSessionStore';
import { DEFAULT_ONLINE_SETTINGS } from '../../../../src/app/online/onlineSettings';
import { decodeControl, encodeControl, type ControlMessage } from '../../../../src/app/online/protocol';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { checkTableProof, makeDeviceProof } from '../../../../src/app/online/sharing/identity/proofs';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData } from '../../../../src/app/online/sharing/people/peopleTypes';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { PresentedScene } from '../../../../src/app/services/PresentedScene';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

const app = { vault: { getName: () => 'Vault', getAbstractFileByPath: () => null, on: () => ({}), offref: () => {} } } as never;
const settings = {
  getOnlineSettings: () => ({ ...DEFAULT_ONLINE_SETTINGS, playerName: 'Morgan' }),
  getLocalPlayerViewSettings: () => ({ showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: false, showWidgets: true, showInitiative: true }),
  onChange: () => () => {},
} as never;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { resetOnlineSessionStore(); });

async function hosting() {
  const network = new MemoryNetwork();
  const host = network.host('gm-id');
  const table = await testTable();
  const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
  const shown: Array<{ name: string; identity: unknown; link: (() => void) | null; answer: (allow: boolean) => void }> = [];
  const svc = new OnlineSessionService(app, settings, {
    createHost: async () => host, presented: new PresentedScene(), table: async () => table, identityCrypto: crypto, people,
    showRequest: (player, answer, info) => {
      shown.push({ name: player.name, identity: info?.identity ?? null, link: info?.link ?? null, answer });
      return { hide: () => {} };
    },
  });
  await svc.start();
  const join = async (
    name: string, keys?: Awaited<ReturnType<typeof crypto.generate>>, nonce = 'nonce-aaaaaaaaaaaaaaaa', hostId = 'gm-id', playerKey = `key-${name}-${nonce}`,
  ) => {
    const link = await network.client().connect('gm-id');
    const received: ControlMessage[] = [];
    link.onMessage((channel, data) => {
      const decoded = decodeControl(data);
      if (channel === 'control' && decoded.kind === 'message') received.push(decoded.message);
    });
    const deviceKeys = keys ?? await crypto.generate();
    const device = await makeDeviceProof(crypto, deviceKeys, table.id, hostId, nonce);
    link.send('control', encodeControl({ v: 1, type: 'join', name, playerKey, client: { kind: 'obsidian', version: '1' }, device }));
    await flush();
    return { link, received, deviceKeys, deviceId: await crypto.keyId(deviceKeys.publicKey) };
  };
  return { svc, table, people, shown, join };
}

describe('OnlineSessionService admitting by identity', () => {
  it('shows a new device as new, and Allow admits with a table proof the player can check', async () => {
    const { svc, table, shown, join } = await hosting();
    const ana = await join('Ana');
    expect(shown[0]).toMatchObject({ name: 'Ana', identity: { kind: 'new', sameName: null }, link: null });
    const playerId = onlineSessionStore.getState().players[0]!.playerId;
    expect(onlineSessionStore.getState().requests[playerId]).toEqual({ kind: 'new', sameName: null });
    shown[0]!.answer(true);
    await flush();
    const admitted = ana.received.find((message) => message.type === 'admitted');
    expect(admitted?.type === 'admitted' && admitted.table && await checkTableProof(crypto, admitted.table, table.id, { hostId: 'gm-id', deviceId: ana.deviceId, nonce: 'nonce-aaaaaaaaaaaaaaaa' })).toBe(true);
    expect(admitted?.type === 'admitted' && admitted.table?.gmName).toBe('Morgan');
    expect(onlineSessionStore.getState().requests).toEqual({});
    svc.stop();
  });

  it('offers Link to Ana for a new device with her name, and links it', async () => {
    const { svc, table, people, shown, join } = await hosting();
    await join('Ana');
    shown[0]!.answer(true);
    await flush();
    const ana = people.byName('Ana')!;
    await join('Ana', undefined, 'nonce-bbbbbbbbbbbbbbbb');
    expect(shown[1]).toMatchObject({ identity: { kind: 'new', sameName: { personId: ana.personId, name: 'Ana' } } });
    shown[1]!.link!();
    await flush();
    expect(people.get(table.id, ana.personId)?.devices).toHaveLength(2);
    expect(onlineSessionStore.getState().players.filter((player) => player.personId === ana.personId)).toHaveLength(2);
    svc.stop();
  });

  it('ignores a second answer for a player whose admission is in flight', async () => {
    const { svc, people, shown, join } = await hosting();
    await join('Ana');
    const signed = vi.spyOn(crypto, 'sign');
    shown[0]!.answer(true);
    shown[0]!.answer(true);
    svc.allow(onlineSessionStore.getState().players[0]!.playerId);
    await flush();
    expect(signed).toHaveBeenCalledTimes(1);
    expect(people.list()).toHaveLength(1);
    expect(onlineSessionStore.getState().players[0]?.status).toBe('admitted');
    signed.mockRestore();
    svc.stop();
  });

  it('signs for the refreshed device proof when the waiting player joins again', async () => {
    const { svc, table, shown, join } = await hosting();
    const first = await join('Ana', undefined, 'nonce-aaaaaaaaaaaaaaaa', 'gm-id', 'same-key');
    const second = await join('Ana', first.deviceKeys, 'nonce-bbbbbbbbbbbbbbbb', 'gm-id', 'same-key');
    expect(shown).toHaveLength(1);
    shown[0]!.answer(true);
    await flush();
    const admitted = second.received.find((message) => message.type === 'admitted');
    const binding = { hostId: 'gm-id', deviceId: second.deviceId };
    expect(admitted?.type === 'admitted' && admitted.table && await checkTableProof(crypto, admitted.table, table.id, { ...binding, nonce: 'nonce-bbbbbbbbbbbbbbbb' })).toBe(true);
    expect(admitted?.type === 'admitted' && admitted.table && await checkTableProof(crypto, admitted.table, table.id, { ...binding, nonce: 'nonce-aaaaaaaaaaaaaaaa' })).toBe(false);
    svc.stop();
  });

  it('denies a join whose device proof was made for another host', async () => {
    const { svc, shown, join } = await hosting();
    const eve = await join('Eve', undefined, 'nonce-cccccccccccccccc', 'other-host');
    expect(shown).toEqual([]);
    expect(eve.received).toEqual([{ v: 1, type: 'denied', reason: 'denied' }]);
    svc.stop();
  });
});
