import { useEffect, useState } from 'react';
import type { AssetTabSpec } from '../../../../../api/types/ui';
import { assetTabSlot } from '../../../../extensions/slots';
import { useSlot } from '../../../../extensions/useSlot';

/** An extension's asset manager tab (`ui.addAssetTab`), keyed by owner and id. */
export interface ExtensionAssetTab {
  key: string;
  owner: string;
  tab: AssetTabSpec;
}

export interface ExtensionAssetTabs {
  tabs: readonly ExtensionAssetTab[];
  /** The extension tab shown in place of the assets; null while one of Atlas's own tabs is. */
  active: ExtensionAssetTab | null;
  /** Shows an extension tab, or (null) goes back to Atlas's own. */
  show: (key: string | null) => void;
}

/**
 * The asset tabs extensions added, and which is shown. Kept apart from Atlas's own tabs, whose
 * counts, folders and remembered place belong to assets: one whose extension removes it falls
 * back to Atlas's tab, and none is remembered when the asset manager closes.
 */
export function useExtensionAssetTabs(isOpen: boolean): ExtensionAssetTabs {
  const entries = useSlot(assetTabSlot);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) setShown(null);
  }, [isOpen]);
  const tabs = entries.map(({ owner, item }) => ({ key: `${owner}:${item.id}`, owner, tab: item }));
  return { tabs, active: tabs.find((entry) => entry.key === shown) ?? null, show: setShown };
}
