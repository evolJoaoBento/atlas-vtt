/**
 * The GM's side of an Obsidian player's join. It checks the device proof (made for this table
 * and host) and finds the person by device id, so a typed name never decides who someone is.
 * A new device with a known name is flagged; only the GM links it to that person. Admitting
 * signs the player's nonce and the person id with the table key.
 */
import type { Admission, SessionPlayer } from '../../gmSessionTypes';
import type { DeviceProof } from '../../protocol';
import type { HostedTable } from '../identity/reissue';
import type { PeopleBook } from './PeopleBook';
import type { Person } from './peopleTypes';

export type JoinIdentity =
  | { kind: 'known'; personId: string; name: string }
  | { kind: 'new'; sameName: { personId: string; name: string } | null };

/** Why a request could not be admitted: `proof` the player's current device proof fails (deny), `person` the person to link to is gone or the device belongs to another (ask again), `unknown` the desk holds no such request. */
export type AdmissionRefusal = 'proof' | 'person' | 'unknown';
export type AdmissionResult = { admission: Admission } | { refused: AdmissionRefusal };

export interface IdentityDeskOptions {
  people: Pick<PeopleBook, 'ready' | 'byDevice' | 'byName' | 'admit' | 'linkDevice' | 'seen'>;
  /** The GM's table for this session: it checks device proofs for the current host id and signs table proofs. */
  table: HostedTable;
}

interface Pending {
  deviceId: string;
  /** The nonce of the proof identified; `admission` takes a newer proof of the same device. */
  nonce: string;
  name: string;
  identity: JoinIdentity;
}

export class IdentityDesk {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly options: IdentityDeskOptions) {}

  /** The request's identity; null when the proof is not for this table and host or does not check (deny it). */
  async identify(player: SessionPlayer, device: DeviceProof): Promise<JoinIdentity | null> {
    const { people, table } = this.options;
    const deviceId = await table.checkDevice(device);
    if (!deviceId) return null;
    await people.ready();
    const known = people.byDevice(table.id, deviceId);
    const named = known ? null : people.byName(player.name, table.id);
    const identity: JoinIdentity = known
      ? { kind: 'known', personId: known.personId, name: known.name }
      : { kind: 'new', sameName: named ? { personId: named.personId, name: named.name } : null };
    this.pending.set(player.playerId, { deviceId, nonce: device.nonce, name: player.name, identity });
    return identity;
  }

  identityOf(playerId: string): JoinIdentity | null {
    return this.pending.get(playerId)?.identity ?? null;
  }

  /**
   * Admits an identified player: as the person their device belongs to, as `linkTo` (a known
   * person on a new device), or as a new person. `device` is the player's current device proof
   * when it was refreshed since `identify` (a new join of the same device has a new nonce); the
   * table proof is signed for it. Otherwise says why not (`AdmissionResult`). The request stays
   * held until `closed`, so a refused or outdated admission can be made again.
   */
  async admission(playerId: string, linkTo: string | null = null, device?: DeviceProof): Promise<AdmissionResult> {
    const held = this.pending.get(playerId);
    if (!held) return { refused: 'unknown' };
    const { people, table } = this.options;
    if (device && (await table.checkDevice(device)) !== held.deviceId) return { refused: 'proof' };
    const nonce = device?.nonce ?? held.nonce;
    let person: Person | null;
    if (linkTo) {
      // A device belongs to one person: linking it to another would leave two owners.
      const owner = people.byDevice(table.id, held.deviceId);
      person = owner && owner.personId !== linkTo ? null : people.linkDevice(table.id, linkTo, held.deviceId);
    } else {
      // The device decides, not what `identify` saw: the person may have been removed or added since.
      const owner = people.byDevice(table.id, held.deviceId);
      person = owner ? people.seen(table.id, owner.personId, owner.name) : people.admit(table.id, held.name, held.deviceId);
    }
    if (!person) return { refused: 'person' };
    const proof = await table.prove(held.deviceId, nonce, person.personId);
    return { admission: { personId: person.personId, table: proof } };
  }

  closed(playerId: string): void {
    this.pending.delete(playerId);
  }
}
