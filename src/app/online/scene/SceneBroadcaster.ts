/**
 * Sends the presented scene to every admitted player: a snapshot on
 * presenting, on resume, on admission and on a player's resync; patches at
 * most every 50 ms in between; `scene-clear` when presenting stops. There is
 * one projection per scene and everyone gets the same messages. It plugs into
 * `GmSession` through `session.use`, so the session never learns about maps.
 */
import type { PresentedSceneInfo } from '../../services/PresentedScene';
import type { ViewAtlasState } from '../../storeFactory';
import type { SessionHandler, SessionPlayer } from '../GmSession';
import { randomId } from '../ids';
import type { ControlMessage } from '../protocol';
import { LiveLighting, type LightingFrame } from './LiveLighting';
import { PlayerChannels } from './PlayerChannels';
import { pickPlayerViewRules, samePlayerViewRules, type PlayerViewRules } from './playerViewRules';
import { projectForPlayers } from './projectForPlayers';
import { createProjectionMemo, type ProjectionMemo } from './projectRecords';
import { diffScenes } from './sceneDiff';
import { patchMessage, snapshotMessages, type SceneOutgoing } from './sceneMessages';
import {
  FOG_TRUNCATED_NOTICE, FogCoverageCache, type FogCoverages, SCENE_TICK_MS, SCENE_TOO_LARGE_NOTICE, sameSlice, sceneContext, sliceOf,
  type LiveScene, type SceneBroadcasterOptions,
} from './sceneSources';
import type { PlayerScene } from './sceneTypes';

export type { PlayerViewSettingsSource, PresentedSceneSource, SceneBroadcasterOptions, SceneSession } from './sceneSources';
export { FOG_TRUNCATED_NOTICE, SCENE_TICK_MS, SCENE_TOO_LARGE_NOTICE } from './sceneSources';

interface Prepared {
  state: ViewAtlasState;
  lighting: LightingFrame | null;
  fog: FogCoverages;
}

/** How often the map's size is looked for while it is unknown. */
export const MAP_SIZE_POLL_MS = 250;

export class SceneBroadcaster implements SessionHandler {
  private readonly stops: Array<() => void> = [];
  private readonly projectionListeners = new Set<(scene: PlayerScene | null) => void>();
  private memo: ProjectionMemo = createProjectionMemo();
  private rules: PlayerViewRules;
  private live: LiveScene | null = null;
  /** The presentation players were last shown, kept while it is held. */
  private shown: PresentedSceneInfo | null = null;
  private sceneId: string | null = null;
  /** What players have: the last projection sent. Held scenes keep it; nothing re-projects it. */
  private lastSent: PlayerScene | null = null;
  private snapshot: { scene: PlayerScene; messages: SceneOutgoing[] | null } | null = null;
  private readonly fogCache = new FogCoverageCache();
  /** The presented view's lighting, while a scene is shown. */
  private lighting: LiveLighting | null = null;
  private tickTimer: number | null = null;
  /** Looks again for the map's size while it is unknown, which hides everything from players. */
  private sizeTimer: number | null = null;
  /** The presentation whose oversize the GM was told about, so the notice shows once. */
  private noticeShownFor: string | null = null;
  private fogNoticeShownFor: string | null = null;
  private readonly channels: PlayerChannels;

  constructor(private readonly options: SceneBroadcasterOptions) {
    this.channels = new PlayerChannels(options.session);
    this.rules = pickPlayerViewRules(options.settings.getLocalPlayerViewSettings());
  }

  start(): void {
    const { session, presented, settings, assets } = this.options;
    this.stops.push(
      session.use(this),
      presented.subscribe({
        presented: (scene, resumed) => this.showScene(scene, resumed),
        held: (scene) => this.holdScene(scene),
        cleared: () => this.clearScene(),
      }),
      settings.onChange(() => this.settingsChanged()),
      // A fingerprint became known or was forgotten: the next tick carries the change.
      assets.onChange(() => { if (this.live && !this.live.loading) this.scheduleTick(); }),
      // A collection's resources and initiative rules are not in the store: edits to them arrive here.
      this.options.watchResources?.(() => { if (this.live && !this.live.loading) this.scheduleTick(); }) ?? (() => undefined),
    );
    const current = presented.current();
    if (current && !presented.isHeld()) this.showScene(current, false);
  }

  stop(): void {
    this.detach();
    this.channels.clear();
    this.stops.splice(0).forEach((stop) => stop());
  }

  /** The scene players have now; null when none was sent or it was cleared. */
  currentProjection(): PlayerScene | null {
    return this.lastSent;
  }

  /** Tells `listener` each time the scene players have changes; the asset server serves only its images. */
  onProjection(listener: (scene: PlayerScene | null) => void): () => void {
    this.projectionListeners.add(listener);
    return () => { this.projectionListeners.delete(listener); };
  }

  /** Also fires when a newer tab of a player replaces an older one: always a full snapshot. */
  onAdmitted(player: SessionPlayer): void {
    this.sendCurrent(player.playerId);
  }

  onMessage(player: SessionPlayer, message: ControlMessage): void {
    // Players never send scene data; a resync is the only scene message the GM acts on.
    if (message.type !== 'scene-resync') return;
    const { playerId } = player;
    this.channels.requestResync(playerId, () => {
      if (this.channels.admitted().includes(playerId)) this.sendCurrent(playerId);
    });
  }

  private showScene(scene: PresentedSceneInfo, resumed: boolean): void {
    this.detach();
    this.shown = scene;
    const sceneId = resumed && this.sceneId !== null ? this.sceneId : randomId();
    if (sceneId !== this.sceneId) this.memo = createProjectionMemo();
    this.sceneId = sceneId;
    const live: LiveScene = {
      scene,
      sceneId,
      loading: scene.store.getState().isMapLoading,
      slice: null,
      unsubscribe: scene.store.subscribe((state) => this.storeChanged(live, state)),
    };
    this.live = live;
    this.lighting = new LiveLighting(scene, () => { if (this.live === live && !live.loading) this.scheduleTick(); });
    if (!live.loading) this.broadcastSnapshot(live);
  }

  /** A presentation that starts held is a new one: players must not see the old scene as its start. */
  private holdScene(scene: PresentedSceneInfo): void {
    this.detach();
    if (this.shown === scene) return;
    const hadScene = this.shown !== null;
    this.forgetScene();
    if (hadScene) this.clearPlayers();
  }

  onGone(player: SessionPlayer): void {
    this.channels.forget(player.playerId);
  }

  private storeChanged(live: LiveScene, state: ViewAtlasState): void {
    if (this.live !== live) return;
    if (state.isMapLoading) {
      // Writes made by loading are not edits: nothing is sent until the map is ready.
      live.loading = true;
      this.cancelTick();
      return;
    }
    if (live.loading) {
      live.loading = false;
      // The store may hold the scene reloaded in place: nothing of the lighting worked out before stands in.
      this.lighting?.restart();
      this.broadcastSnapshot(live);
      return;
    }
    if (live.slice && sameSlice(live.slice, sliceOf(state))) return;
    this.scheduleTick();
  }

  private settingsChanged(): void {
    const rules = pickPlayerViewRules(this.options.settings.getLocalPlayerViewSettings());
    if (samePlayerViewRules(rules, this.rules)) return;
    this.rules = rules;
    // A held scene is not projected again; it gets the new rules when it resumes.
    if (this.live && !this.live.loading) this.scheduleTick();
  }

  private detach(): void {
    this.cancelTick();
    if (this.sizeTimer !== null) window.clearTimeout(this.sizeTimer);
    this.sizeTimer = null;
    this.live?.unsubscribe();
    this.live = null;
    this.lighting?.dispose();
    this.lighting = null;
  }

  private clearScene(): void {
    this.detach();
    this.forgetScene();
    this.clearPlayers();
  }

  private forgetScene(): void {
    this.shown = null;
    this.sceneId = null;
    this.snapshot = null;
    this.setSent(null);
  }

  /** Every change of what players have goes through here, so projection listeners see each one. */
  private setSent(scene: PlayerScene | null): void {
    this.lastSent = scene;
    for (const listener of [...this.projectionListeners]) listener(scene);
  }

  private clearPlayers(): void {
    for (const playerId of this.channels.admitted()) this.channels.sendSequenced(playerId, { v: 1, type: 'scene-clear' });
  }

  private scheduleTick(): void {
    if (this.tickTimer !== null) return;
    this.tickTimer = window.setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, SCENE_TICK_MS);
  }

  private cancelTick(): void {
    if (this.tickTimer !== null) window.clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }

  private tick(): void {
    const live = this.live;
    if (!live || live.loading) return;
    const previous = this.lastSent;
    const prepared = this.prepare(live);
    // Players who got a clear instead of an oversized scene need a snapshot, not a patch.
    if (!previous || previous.sceneId !== live.sceneId || this.snapshotFailed(previous) || prepared.fog.truncated) {
      this.broadcastSnapshot(live, prepared);
      return;
    }
    const next = this.project(live, prepared);
    const patch = diffScenes(previous, next);
    if (!patch) return;
    this.setSent(next);
    const message = patchMessage(patch);
    for (const playerId of this.channels.admitted()) {
      if (message) this.channels.sendSequenced(playerId, message);
      else this.sendSnapshot(playerId);
    }
  }

  /**
   * A truncated fog (`prepared.fog.truncated`): the GM's fog has more operations than players can be sent, so
   * what they would see is not what is covered. Like an oversized scene, they get a clear until it fits again.
   */
  private broadcastSnapshot(live: LiveScene, prepared: Prepared = this.prepare(live)): void {
    this.cancelTick();
    if (prepared.fog.truncated) {
      this.clearForTruncatedFog(live);
      return;
    }
    this.setSent(this.project(live, prepared));
    for (const playerId of this.channels.admitted()) this.sendSnapshot(playerId);
  }

  /** The store, what the view's lighting hides now (null while unlit) and the coverage, worked out once per projection. */
  private prepare(live: LiveScene): Prepared {
    const state = live.scene.store.getState();
    const lighting = this.lighting?.frame(state, live.scene.mapSize()) ?? null;
    // Rebuilt only when the fog operations or the darkness change.
    const fog = this.fogCache.get(state.objects?.fog ?? {}, this.memo, lighting?.darkness);
    // Only painted fog and lighting need the map's size (a scene with neither sends what it has without one).
    if (fog.coverage.hasPaintedFog || state.lighting?.enabled) this.watchMapSize(live);
    return { state, lighting, fog };
  }

  /**
   * Under painted fog or lighting players are shown nothing while the map's size is unknown (the fog and the darkness say nothing
   * outside the map), and the size
   * is read from the background sprite, which can arrive without any change of the store. So while it is unknown, look again
   * every `MAP_SIZE_POLL_MS`, and project once it is known.
   */
  private watchMapSize(live: LiveScene): void {
    const known = (): boolean => {
      const { width, height } = live.scene.mapSize();
      return width > 0 && height > 0;
    };
    if (known() || this.sizeTimer !== null) return;
    this.sizeTimer = window.setTimeout(() => {
      this.sizeTimer = null;
      if (this.live !== live || live.loading) return;
      if (known()) this.scheduleTick();
      else this.watchMapSize(live);
    }, MAP_SIZE_POLL_MS);
  }

  private clearForTruncatedFog(live: LiveScene): void {
    live.slice = sliceOf(live.scene.store.getState());
    if (this.fogNoticeShownFor !== live.sceneId) {
      this.fogNoticeShownFor = live.sceneId;
      this.options.notify(FOG_TRUNCATED_NOTICE);
    }
    const hadScene = this.lastSent !== null;
    this.setSent(null);
    this.snapshot = null;
    if (hadScene) this.clearPlayers();
  }

  private project(live: LiveScene, { state, lighting, fog }: Prepared): PlayerScene {
    live.slice = sliceOf(state);
    return projectForPlayers(state, {
      sceneId: live.sceneId,
      rules: this.rules,
      coverage: fog.coverage,
      darkCoverage: fog.darkCoverage,
      lighting,
      assets: this.options.assets,
      ...sceneContext(live.scene, this.options),
      memo: this.memo,
    });
  }

  /** What players have, or a clear when they have nothing: never a new projection. */
  private sendCurrent(playerId: string): void {
    if (this.lastSent) this.sendSnapshot(playerId);
    else this.channels.sendSequenced(playerId, { v: 1, type: 'scene-clear' });
  }

  /** A scene too large to send reaches players as a clear, never as a stale or partial scene. */
  private sendSnapshot(playerId: string): void {
    const scene = this.lastSent;
    if (!scene) return;
    const messages = this.snapshotOf(scene);
    if (!messages) {
      this.channels.sendSequenced(playerId, { v: 1, type: 'scene-clear' });
      return;
    }
    for (const message of messages) this.channels.sendSequenced(playerId, message);
  }

  private snapshotOf(scene: PlayerScene): SceneOutgoing[] | null {
    if (this.snapshot?.scene !== scene) {
      this.snapshot = { scene, messages: snapshotMessages(scene) };
      if (!this.snapshot.messages && this.noticeShownFor !== scene.sceneId) {
        this.noticeShownFor = scene.sceneId;
        this.options.notify(SCENE_TOO_LARGE_NOTICE);
      }
    }
    return this.snapshot.messages;
  }

  /** Whether the snapshot of `scene` was tried and was too large. */
  private snapshotFailed(scene: PlayerScene): boolean {
    return this.snapshot?.scene === scene && this.snapshot.messages === null;
  }
}
