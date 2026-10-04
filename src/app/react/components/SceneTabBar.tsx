import React, { useState, useSyncExternalStore } from 'react';
import { ChevronDown, Eye, EyeOff, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useSceneTabStore } from '../hooks/useSceneTabStore';
import { useTabStripOverflow } from '../hooks/useTabStripOverflow';
import { usePresentedTabId } from '../hooks/usePresentedTabId';
import { activePresentationTarget, subscribePresentationTargets } from '../../services/presentationTargets';
import { stopPresenting } from '../../services/presentToPlayers';
import type { SceneTab } from '../../types/sceneTabTypes';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import './scene-tab-bar.scss';

type MenuPosition = { x: number; y: number };

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onPresentTab: (tabId: string) => void;
  /** The eye's context menu; returns false when it offers none, so the right-click is left alone. */
  onPresentTabMenu?: ((tabId: string, position: MenuPosition) => boolean) | undefined;
  /** Lists every open map; offered while the tabs do not fit the bar. */
  onShowAllTabs: () => void;
}

interface TabActionButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  /** When defined the button is a toggle and stays visible while active. */
  isActive?: boolean;
  onClick: () => void;
  /** Returns true when it opened a menu of its own. */
  onContextMenu?: ((position: MenuPosition) => boolean) | undefined;
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, onClick, onContextMenu }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', isActive && 'atlas-scene-tab__action--active')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onContextMenu={(e) => {
          if (!onContextMenu?.({ x: e.clientX, y: e.clientY })) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab, onPresentTabMenu, onShowAllTabs }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const presentedTabId = usePresentedTabId(store);
  const target = useSyncExternalStore(subscribePresentationTargets, activePresentationTarget);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const { overflows, hiddenBefore, hiddenAfter } = useTabStripOverflow(strip, activeTabId);

  if (tabs.length === 0) return null;

  const presentLabel = (tab: SceneTab, isPresented: boolean): string => {
    if (isPresented) return target ? `Stop presenting ${tab.displayName}` : `${tab.displayName} is shown to players`;
    return target ? `Present ${tab.displayName} to ${target.label}` : `Show ${tab.displayName} on the player view`;
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-scene-tab-bar">
        <div
          ref={setStrip}
          role="tablist"
          aria-label="Open maps"
          className={cn(
            'atlas-scene-tab-bar__strip',
            hiddenBefore && 'atlas-scene-tab-bar__strip--hidden-before',
            hiddenAfter && 'atlas-scene-tab-bar__strip--hidden-after',
          )}
        >
          {tabs.map((tab: SceneTab) => {
            const isActive = tab.id === activeTabId;
            const isPresented = tab.id === presentedTabId;
            const stateClass = isActive
              ? 'atlas-scene-tab--active'
              : tab.isLoaded
                ? 'atlas-scene-tab--loaded'
                : 'atlas-scene-tab--sleeping';

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={`atlas-scene-tab ${stateClass}`}
                onClick={() => onSwitchTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSwitchTab(tab.id);
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
              >
                {/* Show and close sit at opposite ends, so one is never clicked for the other */}
                <TabActionButton
                  icon={isPresented && target ? EyeOff : Eye}
                  label={presentLabel(tab, isPresented)}
                  isActive={isPresented}
                  // With a target active, the presented scene's eye hides it again.
                  onClick={() => (isPresented && target ? stopPresenting() : onPresentTab(tab.id))}
                  onContextMenu={onPresentTabMenu && ((position) => onPresentTabMenu(tab.id, position))}
                />
                <LabelTooltip side="bottom" label={tab.filePath}>
                  <span className="atlas-scene-tab__name">{tab.displayName}</span>
                </LabelTooltip>
                {tab.isDirty && <span className="atlas-scene-tab__dirty" />}
                <TabActionButton icon={X} label={`Close ${tab.displayName}`} onClick={() => onCloseTab(tab.id)} />
              </div>
            );
          })}
        </div>
        {overflows && (
          <LabelTooltip side="bottom" label="All open maps">
            <button
              type="button"
              className="atlas-scene-tab atlas-scene-tab-bar__button"
              aria-haspopup="dialog"
              onClick={onShowAllTabs}
            >
              <ChevronDown size={14} />
            </button>
          </LabelTooltip>
        )}
        <LabelTooltip side="bottom" label="Open scene">
          <button
            type="button"
            className="atlas-scene-tab atlas-scene-tab-bar__button atlas-scene-tab-bar__add"
            onClick={onAddTab}
          >
            <Plus size={14} />
          </button>
        </LabelTooltip>
      </div>
    </TooltipProvider>
  );
}
