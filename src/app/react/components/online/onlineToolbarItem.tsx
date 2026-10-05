import React from 'react';
import { Network } from 'lucide-react';
import { ToolButton } from '../../../packages/components/primitives/ToolButton';
import type { ToolbarItemBody } from '../../../packages/components/toolbar/toolbarItems';
import type { OnlineSessionState } from '../../../online/onlineSessionStore';
import { ONLINE_SESSION_LABEL } from '../../../online/ui/onlineCopy';

interface OnlineToolbarItemOptions {
  session: Pick<OnlineSessionState, 'status' | 'players'>;
  /** Whether this view's online panel is open; the button stays in the bar meanwhile. */
  open: boolean;
  onToggle: () => void;
}

/** The main toolbar's online session button: a dot while hosting, the number of waiting players instead when there are any. */
export function onlineToolbarItem({ session, open, onToggle }: OnlineToolbarItemOptions): ToolbarItemBody {
  const hosting = session.status === 'hosting';
  const waiting = hosting ? session.players.filter((player) => player.status === 'pending').length : 0;
  const waitingText = `${waiting} waiting to join`;
  const subtitle = waiting > 0 ? waitingText : hosting ? 'Hosting' : null;
  return {
    kind: 'button',
    // The panel hangs from this button.
    pinned: open,
    active: open,
    element: (
      <div className="atlas-online-tool">
        <ToolButton icon={Network} label={ONLINE_SESSION_LABEL} isActive={open} onClick={onToggle} {...(subtitle ? { subtitle } : {})} />
        {waiting > 0 ? (
          <span className="atlas-online-tool__badge">
            <span aria-hidden="true">{waiting}</span>
            <span className="atlas-online-tool__hidden-text">{waitingText}</span>
          </span>
        ) : hosting && <span className="atlas-online-tool__dot" aria-hidden="true" />}
      </div>
    ),
    menuEntry: { icon: Network, label: ONLINE_SESSION_LABEL, isActive: open, onSelect: onToggle },
  };
}
