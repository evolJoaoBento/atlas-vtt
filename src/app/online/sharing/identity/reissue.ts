/** The GM's answer when a person it admitted joins again on a new join: check the device, sign the new nonce. */
import type { Admission, SessionPlayer } from '../../gmSessionTypes';
import type { DeviceProof } from '../../protocol';
import type { IdentityCrypto, TableIdentity } from './identityCrypto';
import { checkDeviceProof, makeTableProof } from './proofs';

export function tableReissuer(
  crypto: IdentityCrypto, table: TableIdentity, hostId: string, gmName: () => string,
): (player: SessionPlayer, device: DeviceProof) => Promise<Admission | null> {
  return async (player, device) => {
    if (!player.personId || (await checkDeviceProof(crypto, device, table.id, hostId)) === null) return null;
    return { personId: player.personId, table: await makeTableProof(crypto, table, device.nonce, player.personId, gmName()) };
  };
}
