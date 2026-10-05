import React from 'react';
import { LocateFixed, Maximize } from 'lucide-react';
import { ToolButton } from '../../../packages/components/primitives/ToolButton';
import type { ResponsiveToolbarItem } from '../../../packages/components/toolbar/toolbarTypes';
import type { OnlineSceneControls } from '../../../online/obsidian/remoteScene';
import { t } from '../../../i18n';

export const FOLLOW_GM_LABEL = t('online.scene.followGm');
export const FIT_MAP_LABEL = t('online.scene.fitMap');

interface OnlineSceneToolbarOptions {
  fitShortcut: string;
  controls: Pick<OnlineSceneControls, 'followGm' | 'fitMap'> | null;
}

/** Follow GM and Fit map, shown while the player has broken away from the GM's camera. */
export function onlineSceneToolbarItems({ fitShortcut, controls }: OnlineSceneToolbarOptions): ResponsiveToolbarItem[] {
  const followGm = (): void => controls?.followGm();
  const fitMap = (): void => controls?.fitMap();
  return [
    {
      id: 'follow',
      kind: 'button',
      pinned: false,
      active: false,
      element: <ToolButton icon={LocateFixed} label={FOLLOW_GM_LABEL} isActive={false} onClick={followGm} />,
      menuEntry: { icon: LocateFixed, label: FOLLOW_GM_LABEL, isActive: false, onSelect: followGm },
    },
    {
      id: 'fit',
      kind: 'button',
      pinned: false,
      active: false,
      element: <ToolButton icon={Maximize} label={FIT_MAP_LABEL} shortcut={fitShortcut} isActive={false} onClick={fitMap} />,
      menuEntry: { icon: Maximize, label: FIT_MAP_LABEL, shortcut: fitShortcut, isActive: false, onSelect: fitMap },
    },
  ];
}
