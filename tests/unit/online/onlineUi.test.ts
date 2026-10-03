import { beforeEach, describe, expect, it, vi } from 'vitest';

const notices: FakeNotice[] = [];
/** Like Obsidian: the message sits in the notice, and a click on the notice hides it. */
class FakeNotice {
  readonly noticeEl = document.createElement('div');
  hidden = false;
  constructor(public readonly message: string | DocumentFragment, _timeout?: number) {
    if (typeof message === 'string') this.noticeEl.textContent = message;
    else this.noticeEl.append(message);
    this.noticeEl.addEventListener('click', () => this.hide());
    notices.push(this);
  }
  hide(): void { this.hidden = true; }
}

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<object>()), Notice: FakeNotice }));

const { Setting } = await import('obsidian');
const { showJoinRequestNotice } = await import('../../../src/app/online/ui/joinRequestNotice');
const { onlineSettingsSection } = await import('../../../src/app/settings/onlineSettingsSection');
const { DEFAULT_ONLINE_SETTINGS } = await import('../../../src/app/online/onlineSettings');
type Settings = Parameters<typeof onlineSettingsSection>[0];

beforeEach(() => { notices.length = 0; });

describe('join request notice', () => {
  it('stays open when its text is clicked and closes with an answer', () => {
    const answers: boolean[] = [];
    showJoinRequestNotice({ playerId: 'p', name: 'Anna', status: 'pending' }, (allow) => answers.push(allow));
    const notice = notices[0]!;
    notice.noticeEl.querySelector<HTMLElement>('.atlas-online-request__text')!.click();
    expect(notice.hidden).toBe(false);
    expect(answers).toEqual([]);
    notice.noticeEl.querySelector<HTMLButtonElement>('button.mod-cta')!.click();
    expect(answers).toEqual([true]);
    expect(notice.hidden).toBe(true);
  });
});

describe('player page setting', () => {
  function playerPageInput(): { input: HTMLInputElement; saved: string[] } {
    const saved: string[] = [];
    let current = { ...DEFAULT_ONLINE_SETTINGS };
    const settings = {
      getOnlineSettings: () => current,
      setOnlineSettings: (partial: Partial<typeof current>) => {
        current = { ...current, ...partial };
        if (partial.playerPageUrl) saved.push(partial.playerPageUrl);
      },
    } as unknown as Settings;
    const row = onlineSettingsSection(settings).rows.find((r) => r.name === 'Player page')!;
    const container = document.createElement('div');
    row.render(new Setting(container));
    return { input: container.querySelector('input')!, saved };
  }

  const type = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('warns once, on leaving the field, about an address that is not http(s)', () => {
    const { input, saved } = playerPageInput();
    type(input, 'n');
    type(input, 'no');
    type(input, 'not a url');
    expect(notices).toHaveLength(0);
    input.dispatchEvent(new Event('change'));
    expect(notices.map((n) => n.message)).toEqual(["That isn't a web address; the player page was not changed."]);
    expect(saved).toEqual([]);
  });

  it('saves a web address and stays quiet, also for an emptied field', () => {
    const { input, saved } = playerPageInput();
    type(input, 'https://example.org/join/');
    input.dispatchEvent(new Event('change'));
    type(input, '');
    input.dispatchEvent(new Event('change'));
    expect(notices).toHaveLength(0);
    expect(saved.at(-1)).toBe('https://example.org/join/');
  });
});

describe('own server settings', () => {
  function ownServerRows() {
    let current = { ...DEFAULT_ONLINE_SETTINGS };
    const listeners = new Set<() => void>();
    const settings = {
      getOnlineSettings: () => current,
      setOnlineSettings: (partial: Partial<typeof current>) => {
        current = { ...current, ...partial };
        listeners.forEach((listener) => listener());
      },
      onChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } as unknown as Settings;
    const container = document.createElement('div');
    const section = onlineSettingsSection(settings);
    const cleanups = section.rows.map((row) => row.render(new Setting(container).setName(row.name)));
    const row = (name: string): HTMLElement => [...container.querySelectorAll<HTMLElement>('.setting-item')]
      .find((el) => el.querySelector('.setting-item-name')?.textContent === name)!;
    return { container, row, cleanups, listeners, select: container.querySelector('select')! };
  }

  it('puts the address fields on their own row under the text, and lets other wide rows wrap', () => {
    const { row } = ownServerRows();
    expect(row('Own server address').classList).toContain('atlas-setting-wrap--below');
    expect([...row('Own server address').querySelectorAll('input')].map((input) => input.getAttribute('aria-label'))).toEqual(['Host', 'Port', 'Path']);
    for (const name of ['Own server key and TLS', 'Relay (TURN) servers', 'Player page', 'Shared note properties']) {
      expect(row(name).classList).toContain('atlas-setting-wrap');
    }
  });

  it('shows the own server fields disabled while the PeerJS cloud is chosen, in place', () => {
    const { row, select, cleanups, listeners } = ownServerRows();
    const address = row('Own server address');
    const key = row('Own server key and TLS');
    expect([...address.querySelectorAll('input')].every((input) => input.disabled)).toBe(true);
    expect(key.querySelector('input')!.disabled).toBe(true);
    expect(key.classList).toContain('is-disabled');
    select.value = 'custom';
    select.dispatchEvent(new Event('change'));
    expect([...address.querySelectorAll('input')].some((input) => input.disabled)).toBe(false);
    expect(key.classList).not.toContain('is-disabled');
    cleanups.forEach((cleanup) => cleanup?.());
    expect(listeners.size).toBe(0);
  });
});
