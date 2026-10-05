import { Notice } from 'obsidian';
import { confirmAction } from '../../ui/confirmDialog';
import { onlineSessionStore } from '../onlineSessionStore';
import { t } from '../../i18n';

export interface TableKeyRenewer {
  renewTableKey(): Promise<string>;
}

/**
 * Asks, then gives this device a new table key: for a key that reached someone else through a
 * synced or backed-up vault. A hosted session stops first. Resolves whether a new key was made.
 */
export async function confirmNewTableKey(service: TableKeyRenewer, confirm: typeof confirmAction = confirmAction): Promise<boolean> {
  const { status } = onlineSessionStore.getState();
  const hosting = status === 'hosting' || status === 'starting';
  const ok = await confirm({
    title: t('online.tableKey.title'),
    message: [t('online.tableKey.message'), ...(hosting ? [t('online.tableKey.hosting')] : [])],
    confirmLabel: t('online.tableKey.confirm'),
    destructive: true,
  });
  if (!ok) return false;
  try {
    await service.renewTableKey();
  } catch (error) {
    console.error('[Atlas online] Could not make a new table key:', error);
    new Notice(t('online.tableKey.failed', { reason: error instanceof Error ? error.message : String(error) }));
    return false;
  }
  new Notice(t('online.tableKey.done'));
  return true;
}
