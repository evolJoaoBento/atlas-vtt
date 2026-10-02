import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';

/** The online scene's slim status bar: the GM's session, the connection, a refusal, and Reconnect. */
export function OnlineSceneBar(): React.ReactElement | null {
  const status = useAtlasStore((state) => state.remoteScene?.status ?? null);
  const notice = useAtlasStore((state) => state.remoteScene?.notice ?? null);
  const { view } = useAtlasUI();
  if (!status) return null;
  return (
    <div className="atlas-online-scene-bar" role="status" aria-live="polite">
      <span className={`atlas-online-scene-bar__dot atlas-online-scene-bar__dot--${status.tone}`} aria-hidden="true" />
      <span className="atlas-online-scene-bar__title">{status.title}</span>
      <span className="atlas-online-scene-bar__connection">{status.connection}</span>
      {status.message && <span className="atlas-online-scene-bar__message">{status.message}</span>}
      {notice && <span className="atlas-online-scene-bar__notice">{notice}</span>}
      {status.reconnect && (
        <Button variant="default" size="sm" className="atlas-online-scene-bar__action" onClick={() => view?.onlineControls()?.reconnect()}>
          Reconnect
        </Button>
      )}
    </div>
  );
}
