import type { Plugin } from 'obsidian';
import { openJoinSessionModal } from './obsidian/ui/JoinSessionModal';
import { onlineSessionStore } from './onlineSessionStore';
import type { OnlineSessionService } from './OnlineSessionService';
import { JOIN_SESSION_LABEL } from './ui/onlineCopy';
import { openOnlineSession } from './ui/openOnlineSession';
import { t } from '../i18n';

/** Commands, the status bar item, and stopping the session with the plugin. */
export function registerOnline(plugin: Plugin, service: OnlineSessionService): void {
  plugin.addCommand({ id: 'online-session', name: t('online.sessionMenu'), callback: () => openOnlineSession(plugin.app) });
  plugin.addCommand({ id: 'join-online-session', name: JOIN_SESSION_LABEL, callback: () => openJoinSessionModal(plugin.app) });
  plugin.addCommand({
    id: 'stop-online-session',
    name: t('online.stopSession'),
    checkCallback: (checking) => {
      if (onlineSessionStore.getState().status !== 'hosting') return false;
      if (!checking) service.stop();
      return true;
    },
  });

  const item = plugin.addStatusBarItem();
  item.addClass('mod-clickable');
  item.addEventListener('click', () => openOnlineSession(plugin.app));
  const render = (): void => {
    const state = onlineSessionStore.getState();
    const connected = state.players.filter((player) => player.status === 'admitted').length;
    const waiting = state.players.filter((player) => player.status === 'pending').length;
    item.toggle(state.status === 'hosting');
    item.setText(waiting
      ? t('online.statusBarWaiting', { count: connected, waiting })
      : t('online.statusBar', { count: connected }));
  };
  render();
  plugin.register(onlineSessionStore.subscribe(render));
  plugin.register(() => service.stop());
}
