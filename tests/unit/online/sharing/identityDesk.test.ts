import { describe, expect, it } from 'vitest';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { checkTableProof, makeDeviceProof } from '../../../../src/app/online/sharing/identity/proofs';
import { hostedTable } from '../../../../src/app/online/sharing/identity/reissue';
import { IdentityDesk } from '../../../../src/app/online/sharing/people/IdentityDesk';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData } from '../../../../src/app/online/sharing/people/peopleTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeIdentityCrypto as crypto, testTable } from './sharingFixtures';

const player = (playerId: string, name: string): SessionPlayer => ({ playerId, name, status: 'pending', client: 'obsidian' });

async function setup() {
  const table = await testTable();
  const people = new PeopleBook(new JsonDataFile(createInMemoryApp().app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData));
  const desk = new IdentityDesk({ people, table: hostedTable(crypto, table, 'host-1', () => 'Morgan') });
  const device = async (hostId = 'host-1', tableId = table.id) => {
    const keys = await crypto.generate();
    const deviceId = await crypto.keyId(keys.publicKey);
    return { keys, deviceId, proof: (nonce: string) => makeDeviceProof(crypto, keys, tableId, hostId, nonce) };
  };
  return { table, people, desk, device };
}

describe('IdentityDesk', () => {
  it('calls a new device new, admits it as a new person with a table proof for its nonce, and knows it next time', async () => {
    const { table, people, desk, device } = await setup();
    const ana = await device();
    const proof = await ana.proof('nonce-aaaaaaaaaaaaaaaa');
    expect(await desk.identify(player('p1', 'Ana'), proof)).toEqual({ kind: 'new', sameName: null });
    const admission = (await desk.admission('p1'))!;
    expect(await checkTableProof(crypto, admission.table, table.id, { hostId: 'host-1', deviceId: ana.deviceId, nonce: 'nonce-aaaaaaaaaaaaaaaa' })).toBe(true);
    expect(admission.table.personId).toBe(admission.personId);
    expect(people.get(table.id, admission.personId)?.name).toBe('Ana');
    expect(await desk.identify(player('p2', 'Whatever'), await ana.proof('nonce-bbbbbbbbbbbbbbbb')))
      .toEqual({ kind: 'known', personId: admission.personId, name: 'Ana' });
    expect((await desk.admission('p2'))?.personId).toBe(admission.personId);
  });

  it('a typed name is not an identity: a known name on a new device is new, with a warning', async () => {
    const { desk, device } = await setup();
    await desk.identify(player('p1', 'Ana'), await (await device()).proof('n1-aaaaaaaaaaaaaaaaaa'));
    const ana = (await desk.admission('p1'))!;
    const impostor = await device();
    expect(await desk.identify(player('p2', 'Ana'), await impostor.proof('n2-aaaaaaaaaaaaaaaaaa')))
      .toEqual({ kind: 'new', sameName: { personId: ana.personId, name: 'Ana' } });
    // Allowing makes them another person, never Ana.
    expect((await desk.admission('p2'))?.personId).not.toBe(ana.personId);
  });

  it('links a new device to a known person when the GM says so', async () => {
    const { table, people, desk, device } = await setup();
    await desk.identify(player('p1', 'Ana'), await (await device()).proof('n1-aaaaaaaaaaaaaaaaaa'));
    const ana = (await desk.admission('p1'))!;
    const laptop = await device();
    await desk.identify(player('p2', 'Ana'), await laptop.proof('n2-aaaaaaaaaaaaaaaaaa'));
    expect((await desk.admission('p2', ana.personId))?.personId).toBe(ana.personId);
    expect(people.get(table.id, ana.personId)?.devices).toHaveLength(2);
  });

  it('signs for a refreshed device proof of the same device, and refuses another device', async () => {
    const { table, desk, device } = await setup();
    const ana = await device();
    await desk.identify(player('p1', 'Ana'), await ana.proof('nonce-aaaaaaaaaaaaaaaa'));
    const refreshed = await ana.proof('nonce-bbbbbbbbbbbbbbbb');
    expect(await desk.admission('p1', null, await (await device()).proof('nonce-cccccccccccccccc'))).toBeNull();
    const admission = (await desk.admission('p1', null, refreshed))!;
    const binding = { hostId: 'host-1', deviceId: ana.deviceId };
    expect(await checkTableProof(crypto, admission.table, table.id, { ...binding, nonce: 'nonce-bbbbbbbbbbbbbbbb' })).toBe(true);
    expect(await checkTableProof(crypto, admission.table, table.id, { ...binding, nonce: 'nonce-aaaaaaaaaaaaaaaa' })).toBe(false);
  });

  it('keeps a request after a link to nobody, so the GM can answer again', async () => {
    const { desk, device } = await setup();
    await desk.identify(player('p1', 'Ana'), await (await device()).proof('n1-aaaaaaaaaaaaaaaaaa'));
    expect(await desk.admission('p1', 'nobody')).toBeNull();
    expect((await desk.admission('p1'))?.personId).toBeTruthy();
  });

  it('refuses a proof for another host or table, and forgets closed requests', async () => {
    const { desk, device } = await setup();
    expect(await desk.identify(player('p1', 'Ana'), await (await device('other-host')).proof('n1-aaaaaaaaaaaaaaaaaa'))).toBeNull();
    expect(await desk.identify(player('p2', 'Ana'), await (await device('host-1', 'X'.repeat(43))).proof('n2-aaaaaaaaaaaaaaaaaa'))).toBeNull();
    await desk.identify(player('p3', 'Ana'), await (await device()).proof('n3-aaaaaaaaaaaaaaaaaa'));
    desk.closed('p3');
    expect(await desk.admission('p3')).toBeNull();
  });
});
