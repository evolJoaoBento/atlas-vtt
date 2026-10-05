import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Network, Square } from 'lucide-react';
import { Notice, type App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useStore } from 'zustand';
import { isInSession, joinedSessionStore } from '../../../online/obsidian/joinedSessionStore';
import { openJoinSessionModal } from '../../../online/obsidian/ui/JoinSessionModal';
import { OnlineSessionService } from '../../../online/OnlineSessionService';
import type { OnlineSessionState } from '../../../online/onlineSessionStore';
import { openSharedFromView } from '../../../online/sharing/sharedFromView';
import { shareSessionStore } from '../../../online/sharing/shareSessionStore';
import { JOIN_SESSION_LABEL, ONLINE_SESSION_LABEL, SHARED_WITH_ME_BUTTON, START_SESSION_LABEL, STOP_SESSION_LABEL } from '../../../online/ui/onlineCopy';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { OnlinePlayerList } from './OnlinePlayerList';
import { OnlinePresenting } from './OnlinePresenting';
import { useOnlineSession } from './useOnlineState';
import { t } from '../../../i18n';

export const START_HELP = t('online.panel.startHelp');

/** The online session panel of a map view; shown for the GM while it is open. */
export function OnlinePanel(): React.ReactElement {
  const open = useAtlasStore((state) => state.isOnlinePanelOpen);
  return <AnimatePresence>{open && <OnlinePanelWindow key="online-panel" />}</AnimatePresence>;
}

function OnlinePanelWindow(): React.ReactElement {
  const { app } = useAtlasUI();
  const setOpen = useAtlasStore((state) => state.setOnlinePanelOpen);
  const windowVariants = useDialogWindowVariants();
  const session = useOnlineSession();
  const service = OnlineSessionService.forApp(app);

  return (
    <motion.section
      className="atlas-online-panel"
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={ONLINE_SESSION_LABEL}
    >
      <header className="atlas-online-panel__header">
        <span className="atlas-online-panel__icon"><Network /></span>
        <h2 className="atlas-online-panel__title">{ONLINE_SESSION_LABEL}</h2>
        <CloseButton onClick={() => setOpen(false)} aria-label={t('online.panel.close')} />
      </header>
      <div className="atlas-online-panel__body">
        {session.status === 'hosting' && service
          ? <HostingView session={session} service={service} />
          : <StartView session={session} service={service} app={app} />}
      </div>
    </motion.section>
  );
}

function StartView({ session, service, app }: { session: OnlineSessionState; service: OnlineSessionService | undefined; app: App }): React.ReactElement {
  const starting = session.status === 'starting';
  const joined = useStore(joinedSessionStore, isInSession);
  return (
    <section className="atlas-online-panel__section">
      <p className="atlas-online-panel__help">{START_HELP}</p>
      {session.status === 'error' && session.error && (
        <p className="atlas-online-panel__error" role="alert">{session.error}</p>
      )}
      <div className="atlas-online-panel__footer">
        <Button variant="outline" disabled={starting || joined} onClick={() => openJoinSessionModal(app)}>
          {JOIN_SESSION_LABEL}
        </Button>
        <Button variant="default" disabled={starting || !service} onClick={() => { void service?.start(); }}>
          {starting ? t('online.panel.starting') : START_SESSION_LABEL}
        </Button>
      </div>
    </section>
  );
}

function HostingView({ session, service }: { session: OnlineSessionState; service: OnlineSessionService }): React.ReactElement {
  const url = session.joinUrl;
  const { app } = useAtlasUI();
  const sharing = useStore(shareSessionStore, (state) => state.session !== null);
  return (
    <>
      <section className="atlas-online-panel__section" aria-label={t('online.panel.sessionStatus')}>
        <p className="atlas-online-panel__status">
          <span className="atlas-online-panel__dot" aria-hidden="true" />
          <span className="atlas-online-panel__status-text">{t('online.panel.connected')}</span>
          <LabelTooltip label={STOP_SESSION_LABEL}>
            <Button variant="ghost" size="icon" className="atlas-online-panel__stop" aria-label={STOP_SESSION_LABEL} onClick={() => service.stop()}>
              <Square />
            </Button>
          </LabelTooltip>
        </p>
        {session.error && <p className="atlas-online-panel__error" role="status">{session.error}</p>}
        {url && (
          <div className="atlas-online-panel__link">
            <input type="text" readOnly value={url} aria-label={t('online.joinLink')} onFocus={(event) => event.currentTarget.select()} />
            <LabelTooltip label={t('online.copyLink')}>
              <Button variant="ghost" size="icon" aria-label={t('online.copyLink')} onClick={() => copyJoinLink(url)}>
                <Copy />
              </Button>
            </LabelTooltip>
          </div>
        )}
      </section>
      <OnlinePlayerList players={session.players} requests={session.requests} control={session.tokenControl} service={service} />
      <OnlinePresenting />
      {sharing && (
        <section className="atlas-online-panel__section">
          <div className="atlas-online-panel__footer">
            <Button variant="outline" onClick={() => openSharedFromView(app)}>{SHARED_WITH_ME_BUTTON}</Button>
          </div>
        </section>
      )}
    </>
  );
}

function copyJoinLink(url: string): void {
  void navigator.clipboard.writeText(url).then(
    () => new Notice(t('online.linkCopied')),
    () => new Notice(t('online.copyFailed')),
  );
}
