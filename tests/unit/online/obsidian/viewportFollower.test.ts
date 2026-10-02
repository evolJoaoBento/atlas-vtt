import { describe, expect, it, vi } from 'vitest';
import { ViewportFollower, type FollowViewport, type Frames } from '../../../../src/app/online/obsidian/ViewportFollower';
import { GLIDE_MS } from '../../../../src/app/online/view/camera';
import { playerScene } from '../sceneFixtures';

class FakeViewport implements FollowViewport {
  screenWidth = 800;
  screenHeight = 600;
  center = { x: 0, y: 0 };
  scale = { x: 1 };
  private readonly listeners = new Set<(event: { type: string }) => void>();
  readonly setZoom = vi.fn((zoom: number): void => { this.scale.x = zoom; });
  readonly moveCenter = vi.fn((x: number, y: number): void => { this.center = { x, y }; });
  on(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.add(listener); }
  off(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.delete(listener); }
  /** pixi-viewport's `moved` event after one of its plugins moved it. */
  moved(type: string): void { for (const listener of [...this.listeners]) listener({ type }); }
  get listenerCount(): number { return this.listeners.size; }
}

function manualFrames(): Frames & { run(): void; pending(): number } {
  let queue: Array<() => void> = [];
  return {
    request: (draw) => { queue.push(draw); return queue.length; },
    cancel: () => { queue = []; },
    run: () => { const due = queue; queue = []; due.forEach((draw) => draw()); },
    pending: () => queue.length,
  };
}

function setup() {
  const viewport = new FakeViewport();
  const frames = manualFrames();
  let now = 0;
  const onFollowingChange = vi.fn();
  const follower = new ViewportFollower({ viewport, onFollowingChange, now: () => now, frames });
  const settle = (): void => {
    now += GLIDE_MS + 1;
    frames.run();
    frames.run();
  };
  return { viewport, frames, follower, onFollowingChange, settle };
}

const GM_CAMERA = { sceneId: 'scene-1', centerX: 200, centerY: 100, width: 400, height: 300 };

describe('ViewportFollower', () => {
  it('fits a new scene, then glides to each GM camera while following', () => {
    const { viewport, follower, settle } = setup();
    follower.setScene(playerScene());
    settle();
    expect(viewport.center).toEqual({ x: 500, y: 400 });
    follower.setGmCamera(GM_CAMERA);
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    expect(viewport.scale.x).toBe(2);
  });

  it("breaks away on the player's own drag, wheel, pinch or glide-out, and stays there", () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    settle();
    for (const type of ['drag', 'wheel', 'pinch', 'decelerate']) {
      onFollowingChange.mockClear();
      follower.followGm();
      settle();
      viewport.center = { x: 321, y: 123 };
      const moves = viewport.moveCenter.mock.calls.length;
      viewport.moved(type);
      expect(onFollowingChange).toHaveBeenLastCalledWith(false);
      follower.setGmCamera(GM_CAMERA);
      settle();
      expect(viewport.moveCenter.mock.calls.length).toBe(moves);
      expect(viewport.center).toEqual({ x: 321, y: 123 });
    }
  });

  it("keeps following through moves that are not the player's", () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    settle();
    viewport.moved('animate');
    viewport.moved('follow');
    expect(onFollowingChange).not.toHaveBeenCalled();
  });

  it('comes back with Follow GM, and fits the map with Fit map while staying away', () => {
    const { viewport, follower, onFollowingChange, settle } = setup();
    follower.setScene(playerScene());
    follower.setGmCamera(GM_CAMERA);
    settle();
    viewport.moved('drag');
    follower.followGm();
    expect(onFollowingChange).toHaveBeenLastCalledWith(true);
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    follower.fitMap();
    expect(onFollowingChange).toHaveBeenLastCalledWith(false);
    settle();
    expect(viewport.center).toEqual({ x: 500, y: 400 });
  });

  it('puts the camera back after something else moved the viewport', () => {
    const { viewport, follower, settle } = setup();
    follower.setScene(playerScene());
    follower.setGmCamera(GM_CAMERA);
    settle();
    viewport.center = { x: 500, y: 400 };
    follower.reapply();
    settle();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
  });

  it('stops listening and drawing once disposed', () => {
    const { viewport, frames, follower } = setup();
    follower.setScene(playerScene());
    follower.dispose();
    expect(viewport.listenerCount).toBe(0);
    expect(frames.pending()).toBe(0);
  });
});
