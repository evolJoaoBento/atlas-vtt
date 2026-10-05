import React, { useEffect, useRef, useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import type { PanelSpec, ViewContext } from '../../api/types/ui';
import { CloseButton } from '../packages/components/primitives/CloseButton';
import { useDialogWindowVariants } from '../packages/components/primitives/dialogMotion';
import { safely } from './SlotRegistry';
import { t } from '../i18n';

interface ExtensionPanelFrameProps {
  owner: string;
  panel: PanelSpec;
  ctx: ViewContext;
  onClose: () => void;
}

/**
 * Atlas's panel around what an extension renders: the panel corner, a header with the title and `CloseButton`,
 * and the dialogs' motion. The extension mounts into the body when the panel opens and its disposer runs as soon
 * as the panel starts to close (not after the exit motion), when the view unmounts, or when the panel is disposed.
 */
export function ExtensionPanelFrame({ owner, panel, ctx, onClose }: ExtensionPanelFrameProps): React.ReactElement | null {
  const variants = useDialogWindowVariants();
  const present = useIsPresent();
  const body = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // The context is read when the panel opens; a later render must not mount it again.
  const latest = useRef({ ctx, onClose });
  latest.current = { ctx, onClose };

  useEffect(() => {
    const container = body.current;
    if (!container || !present) return undefined;
    let disposer: (() => void) | null = null;
    try {
      const result: unknown = panel.mount(container, latest.current.ctx);
      disposer = typeof result === 'function' ? (result as () => void) : null;
    } catch (error) {
      console.error(`[Atlas API] ${owner}: panel "${panel.id}" mount failed:`, error);
      setFailed(true);
      latest.current.onClose();
      return undefined;
    }
    return () => {
      const dispose = disposer;
      if (dispose) safely(owner, `panel "${panel.id}" disposer`, () => { dispose(); }, undefined);
      container.replaceChildren();
    };
  }, [panel, owner, present]);

  if (failed) return null;
  return (
    <motion.section
      className="atlas-extension-panel"
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label={panel.title}
    >
      <header className="atlas-extension-panel__header">
        <h2 className="atlas-extension-panel__title">{panel.title}</h2>
        <CloseButton onClick={onClose} aria-label={t('extensions.closePanel', { name: panel.title })} />
      </header>
      <div ref={body} className="atlas-extension-panel__body" />
    </motion.section>
  );
}
