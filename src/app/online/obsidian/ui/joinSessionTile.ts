/**
 * The dashboard's "Join online session" tile: it opens the Join dialog, as the command and the
 * Online panel do. While Atlas hosts or is already in a session, the dialog's Join refuses with
 * its own reason (`JOIN_PROBLEM_TEXT`).
 */
import type { App } from 'obsidian';
import { LogIn, type LucideIcon } from 'lucide-react';
import { openJoinSessionModal } from './JoinSessionModal';
import { t } from '../../../i18n';

export interface DashboardTile {
  key: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  onClick: () => void;
}

export function joinSessionTile(app: App): DashboardTile {
  return {
    key: 'join',
    icon: LogIn,
    title: t('online.join.title'),
    desc: t('online.join.tileDesc'),
    onClick: () => openJoinSessionModal(app),
  };
}
