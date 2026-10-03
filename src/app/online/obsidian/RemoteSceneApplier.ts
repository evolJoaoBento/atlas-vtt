/**
 * Writes the presented scene into the online scene view's store. An Atlas record is rebuilt only
 * when its GM record changed (`PlayerSceneMirror` keeps unchanged ones as the same objects) or
 * its image URL or shown position changed, and a store field is written only when it changed,
 * so Atlas's renderers redraw what a local edit would make them redraw. Writes are untracked:
 * the remote store records no history anyway.
 */
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { runUntracked } from '../../stores/history';
import type { DrawingStroke, TextElement, TokenEntity } from '../../types';
import type { FogOperation } from '../../types/fogTypes';
import { sameValue, setOwn } from '../scene/sceneDiff';
import type { PlayerDrawing, PlayerFogOp, PlayerScene, PlayerText, PlayerToken, ScenePoint } from '../scene/sceneTypes';
import { atlasDrawing, atlasFog, atlasText } from './convertShapes';
import { DOWNED_KEY } from './convertResources';
import { atlasToken } from './convertTokens';
import { emptyRemoteScene, playerSceneToAtlasState, type RecordBuilders, type RemoteSceneParts } from './playerSceneToAtlasState';
import type { RemoteImages } from './remoteScene';

type RemoteStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>;

interface Entry<S, A> {
  source: S;
  /** What else the record was built from: its image URL and shown position. */
  input: string;
  record: A;
}

/** Atlas records by id, kept while their GM record and inputs stay the same; the same result object while nothing changed. */
class RecordMemo<S, A> {
  private entries = new Map<string, Entry<S, A>>();
  private result: Record<string, A> = {};

  build(records: Readonly<Record<string, S>>, input: (id: string, source: S) => string, convert: (id: string, source: S) => A): Record<string, A> {
    const next = new Map<string, Entry<S, A>>();
    let changed = Object.keys(records).length !== this.entries.size;
    for (const [id, source] of Object.entries(records)) {
      const key = input(id, source);
      const previous = this.entries.get(id);
      if (previous && previous.source === source && previous.input === key) {
        next.set(id, previous);
        continue;
      }
      changed = true;
      next.set(id, { source, input: key, record: convert(id, source) });
    }
    this.entries = next;
    if (changed) {
      const result: Record<string, A> = {};
      for (const [id, entry] of next) setOwn(result, id, entry.record);
      this.result = result;
    }
    return this.result;
  }

  clear(): void {
    this.entries = new Map();
    this.result = {};
  }
}

export interface RemoteSceneApplierOptions {
  store: RemoteStore;
  images: RemoteImages;
  /** Where this view shows a token instead of the GM's position: a drag, or a drop the GM has not answered. */
  positionOf?: (tokenId: string) => ScenePoint | null;
}

const NO_POSITION = (): ScenePoint | null => null;
const NO_INPUT = (): string => '';
const pointKey = (point: ScenePoint | null): string => (point ? `${point.x},${point.y}` : '');
const OBJECT_KINDS = ['tokens', 'fog', 'texts', 'drawings'] as const;
/** What the GM's scene decides of `remoteScene`, besides the session's own state. */
const REMOTE_PARTS = ['measurement', 'conditions', 'resources', 'initiativeHealth'] as const;

export class RemoteSceneApplier {
  private scene: PlayerScene | null = null;
  private readonly tokens = new RecordMemo<PlayerToken, TokenEntity>();
  private readonly fog = new RecordMemo<PlayerFogOp, FogOperation>();
  private readonly texts = new RecordMemo<PlayerText, TextElement>();
  private readonly drawings = new RecordMemo<PlayerDrawing, DrawingStroke>();
  private readonly builders: RecordBuilders;

  constructor(private readonly options: RemoteSceneApplierOptions) {
    const { images } = options;
    const positionOf = options.positionOf ?? NO_POSITION;
    this.builders = {
      tokens: (tokens) => this.tokens.build(
        tokens,
        (id, token) => `${images.token(token.image) ?? ''}|${pointKey(positionOf(id))}`,
        (id, token) => atlasToken(id, token, images.token(token.image) ?? '', positionOf(id)),
      ),
      fog: (fog) => this.fog.build(fog, NO_INPUT, atlasFog),
      texts: (texts) => this.texts.build(texts, NO_INPUT, atlasText),
      drawings: (drawings) => this.drawings.build(drawings, NO_INPUT, atlasDrawing),
    };
  }

  /** The scene last applied; null while none is shown. */
  get current(): PlayerScene | null {
    return this.scene;
  }

  apply(scene: PlayerScene | null): void {
    this.scene = scene;
    this.write();
  }

  /** Writes the last scene again: an image arrived or went, or a shown position changed. */
  refresh(): void {
    this.write();
  }

  dispose(): void {
    this.scene = null;
    this.tokens.clear();
    this.fog.clear();
    this.texts.clear();
    this.drawings.clear();
  }

  private write(): void {
    const parts = this.scene ? playerSceneToAtlasState(this.scene, this.options.images, this.builders) : emptyRemoteScene(this.builders);
    const { store } = this.options;
    const update = this.changes(store.getState(), parts);
    if (Object.keys(update).length === 0) return;
    runUntracked(store, () => store.setState(update));
  }

  private changes(state: ViewAtlasState, parts: RemoteSceneParts): Partial<ViewAtlasState> {
    const next = parts.state;
    const update: Partial<ViewAtlasState> = {};
    if (state.background !== next.background) update.background = next.background;
    if (!sameValue(state.grid, next.grid)) update.grid = next.grid;
    if (OBJECT_KINDS.some((kind) => state.objects[kind] !== next.objects[kind])) {
      // Pins, walls, lights and sounds stay the store's own empty records.
      update.objects = {
        ...state.objects, tokens: next.objects.tokens, fog: next.objects.fog, texts: next.objects.texts, drawings: next.objects.drawings,
      };
    }
    if (!sameValue(state.widgetSettings, next.widgetSettings)) update.widgetSettings = next.widgetSettings;
    if (!sameValue(state.widgetValues, next.widgetValues)) update.widgetValues = next.widgetValues;
    if (!sameValue(state.initiative, next.initiative)) update.initiative = next.initiative;
    if (state.initiativeTrackerOpen !== next.initiativeTrackerOpen) update.initiativeTrackerOpen = next.initiativeTrackerOpen;
    // The downed stand-ins are not bars: the token UI skips them
    if (!state.tokenSettings.hiddenResources.includes(DOWNED_KEY)) {
      update.tokenSettings = { ...state.tokenSettings, hiddenResources: [...state.tokenSettings.hiddenResources, DOWNED_KEY] };
    }
    const remote = state.remoteScene;
    const { measurement, conditions, resources, initiativeHealth } = parts;
    const scene = { measurement, conditions, resources, initiativeHealth };
    if (remote && REMOTE_PARTS.some((key) => !sameValue(remote[key], scene[key]))) update.remoteScene = { ...remote, ...scene };
    return update;
  }
}
