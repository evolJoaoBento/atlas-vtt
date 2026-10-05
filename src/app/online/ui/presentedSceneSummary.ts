/**
 * The presented scene as the GM's online panel and palette see it: its tab, its name
 * and its character tokens. While the scene is held (the GM shows another tab) or its
 * map is loading, the view's store holds another map, so no characters are offered.
 * Read through `useSyncExternalStore`: `readPresentedScene` returns the same object
 * until something it reads changes.
 */
import { presentedScene, type PresentedSceneInfo } from '../../services/PresentedScene';
import type { Character, TokenEntity } from '../../types';
import { t } from '../../i18n';

export interface PresentedCharacter {
  id: string;
  name: string;
}

export interface PresentedSceneSummary {
  /** The presented tab; null while nothing is presented. */
  tabId: string | null;
  /** The presented tab's name; null while nothing is presented. */
  name: string | null;
  /** The presented scene's character tokens; empty while it cannot be assigned from. */
  characters: readonly PresentedCharacter[];
}

const NOTHING: PresentedSceneSummary = { tabId: null, name: null, characters: [] };

interface Cached {
  scene: PresentedSceneInfo;
  assignable: boolean;
  tokens: Record<string, TokenEntity> | null;
  tabs: unknown;
  value: PresentedSceneSummary;
}
let cached: Cached | null = null;

/** A character's name as the panel lists it, like the nameplate's fallback. */
export function characterName(token: Character): string {
  return token.name || token.statblockName || t('online.unnamedCharacter');
}

function charactersOf(tokens: Record<string, TokenEntity>): PresentedCharacter[] {
  return Object.values(tokens)
    .filter((token): token is Character => token.kind === 'character')
    .map((token) => ({ id: token.id, name: characterName(token) }));
}

export function readPresentedScene(): PresentedSceneSummary {
  const scene = presentedScene.current();
  if (!scene) return NOTHING;
  const state = scene.store.getState();
  const assignable = !presentedScene.isHeld() && !state.isMapLoading;
  const tokens = assignable ? state.objects.tokens : null;
  const tabs = scene.view.tabMetaStore.getState().tabs;
  if (cached && cached.scene === scene && cached.assignable === assignable && cached.tokens === tokens && cached.tabs === tabs) {
    return cached.value;
  }
  const value: PresentedSceneSummary = {
    tabId: scene.tabId,
    name: tabs.find((tab) => tab.id === scene.tabId)?.displayName ?? null,
    characters: tokens ? charactersOf(tokens) : [],
  };
  // Token drags change the tokens every frame: keep the previous summary while nothing it shows changed.
  const result = cached && sameSummary(cached.value, value) ? cached.value : value;
  cached = { scene, assignable, tokens, tabs, value: result };
  return result;
}

function sameSummary(a: PresentedSceneSummary, b: PresentedSceneSummary): boolean {
  return a.tabId === b.tabId && a.name === b.name
    && a.characters.length === b.characters.length
    && a.characters.every((character, index) => character.id === b.characters[index]?.id && character.name === b.characters[index].name);
}

/** Calls `onChange` when the presented scene, its tokens, its loading or its tab names change. */
export function subscribePresentedScene(onChange: () => void): () => void {
  const watch = (scene: PresentedSceneInfo | null): (() => void) => {
    if (!scene) return () => undefined;
    const stopStore = scene.store.subscribe(onChange);
    const stopTabs = scene.view.tabMetaStore.subscribe(onChange);
    return () => {
      stopStore();
      stopTabs();
    };
  };
  let stopScene = watch(presentedScene.current());
  const changed = (): void => {
    stopScene();
    stopScene = watch(presentedScene.current());
    onChange();
  };
  const stopPresented = presentedScene.subscribe({ presented: changed, held: changed, cleared: changed });
  return () => {
    stopPresented();
    stopScene();
  };
}
