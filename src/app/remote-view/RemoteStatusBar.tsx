import React from 'react';
import { Button } from '../packages/components/primitives/button';
import { ObsidianIcon } from '../react/components/ObsidianIcon';
import { useAtlasStore } from '../react/ViewStoreContext';

/** The remote view's slim status bar: its owner's title, connection and message, and the owner's action, then its actions. */
export function RemoteStatusBar(): React.ReactElement | null {
  const status = useAtlasStore((state) => state.remoteView?.status ?? null);
  const actions = status?.actions ?? [];
  if (!status || (status.title === '' && status.connection === '' && !status.message && !status.action && actions.length === 0)) return null;
  const { action } = status;
  return (
    <div className="atlas-remote-status-bar" role="status" aria-live="polite">
      <span className={`atlas-remote-status-bar__dot atlas-remote-status-bar__dot--${status.tone}`} aria-hidden="true" />
      {status.title && <span className="atlas-remote-status-bar__title">{status.title}</span>}
      {status.connection && <span className="atlas-remote-status-bar__connection">{status.connection}</span>}
      {status.message && <span className="atlas-remote-status-bar__message">{status.message}</span>}
      {action && (
        <Button variant="default" size="sm" className="atlas-remote-status-bar__action" onClick={() => action.run()}>
          <span className="atlas-remote-status-bar__action-label">{action.label}</span>
        </Button>
      )}
      {actions.map((choice) => (
        <Button key={choice.id} variant="default" size="sm" className="atlas-remote-status-bar__action" onClick={() => choice.run()}>
          {choice.icon && <ObsidianIcon name={choice.icon} className="atlas-remote-status-bar__action-icon" />}
          <span className="atlas-remote-status-bar__action-label">{choice.label}</span>
        </Button>
      ))}
    </div>
  );
}
