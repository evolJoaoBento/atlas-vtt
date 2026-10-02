/** The GM's table key, kept in Atlas's settings: made the first time this Atlas hosts, then stable. */
import type { OnlineSettings } from '../../onlineSettings';
import type { IdentityCrypto, TableIdentity } from './identityCrypto';

export interface TableSettings {
  getOnlineSettings(): OnlineSettings;
  setOnlineSettings(settings: Partial<OnlineSettings>): void;
}

export async function ensureTableIdentity(settings: TableSettings, crypto: IdentityCrypto): Promise<TableIdentity> {
  const stored = settings.getOnlineSettings().table;
  if (stored) return { id: stored.id, keys: { publicKey: stored.publicKey, privateKey: stored.privateKey } };
  const keys = await crypto.generate();
  const id = await crypto.keyId(keys.publicKey);
  settings.setOnlineSettings({ table: { id, publicKey: keys.publicKey, privateKey: keys.privateKey } });
  return { id, keys };
}
