import { App, Modal, Notice, setIcon } from 'obsidian';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../ui/nativeModal';
import { OnlineSessionService } from '../OnlineSessionService';
import { onlineSessionStore, type OnlineSessionState } from '../onlineSessionStore';
import { t } from '../../i18n';

const STATUS_TEXT: Record<OnlineSessionState['status'], string> = {
  idle: t('online.modal.idle'),
  starting: t('online.modal.starting'),
  hosting: t('online.modal.hosting'),
  error: t('online.modal.error'),
};

/** Start or stop the online session, share its link, and manage players. */
export class OnlineSessionModal extends Modal {
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private readonly service: OnlineSessionService) {
    super(app);
    this.modalEl.addClasses([...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-online-modal']);
  }

  onOpen(): void {
    this.titleEl.setText(t('online.sessionLabel'));
    this.render(onlineSessionStore.getState());
    this.unsubscribe = onlineSessionStore.subscribe((state) => this.render(state));
  }

  onClose(): void {
    this.unsubscribe?.();
    this.contentEl.empty();
  }

  private render(state: OnlineSessionState): void {
    const el = this.contentEl;
    el.empty();
    el.createEl('p', { cls: 'atlas-online-modal__status', text: STATUS_TEXT[state.status] });
    if (state.error) el.createEl('p', { cls: 'atlas-online-modal__error', text: state.error });

    if (state.status === 'hosting' && state.joinUrl) {
      const row = el.createDiv({ cls: 'atlas-online-modal__link' });
      row.createEl('input', { type: 'text', attr: { readonly: 'true', value: state.joinUrl, 'aria-label': t('online.joinLink') } });
      const copy = row.createEl('button', { text: t('online.copyLink') });
      const url = state.joinUrl;
      copy.addEventListener('click', () => { void navigator.clipboard.writeText(url).then(() => new Notice(t('online.linkCopied'))); });
    }

    const players = state.players;
    if (players.length) {
      const list = el.createEl('ul', { cls: 'atlas-online-modal__players' });
      for (const player of players) {
        const item = list.createEl('li', { cls: `atlas-online-modal__player atlas-online-modal__player--${player.status}` });
        const dot = item.createSpan({ cls: 'atlas-online-modal__dot' });
        setIcon(dot, player.status === 'pending' ? 'hourglass' : 'circle');
        item.createSpan({ cls: 'atlas-online-modal__name' }).setText(player.name);
        item.createSpan({ cls: 'atlas-online-modal__state', text: player.status === 'pending' ? t('online.modal.wantsToJoin') : player.status === 'gone' ? t('online.modal.disconnected') : t('online.modal.connected') });
        if (player.status === 'pending') {
          item.createEl('button', { cls: 'mod-cta', text: t('online.allow') }).addEventListener('click', () => this.service.allow(player.playerId));
          item.createEl('button', { text: t('online.deny') }).addEventListener('click', () => this.service.deny(player.playerId));
        } else {
          item.createEl('button', { text: t('common.remove') }).addEventListener('click', () => this.service.kick(player.playerId));
        }
      }
    }

    const footer = el.createDiv({ cls: 'atlas-online-modal__footer' });
    if (state.status === 'hosting') {
      footer.createEl('button', { cls: 'mod-warning', text: t('online.modal.stopSession') }).addEventListener('click', () => this.service.stop());
    } else {
      const start = footer.createEl('button', { cls: 'mod-cta', text: state.status === 'error' ? t('online.modal.tryAgain') : t('online.modal.startSession') });
      start.disabled = state.status === 'starting';
      start.addEventListener('click', () => void this.service.start());
    }
  }
}

export function openOnlineSessionModal(app: App): void {
  const service = OnlineSessionService.forApp(app);
  if (service) new OnlineSessionModal(app, service).open();
}
