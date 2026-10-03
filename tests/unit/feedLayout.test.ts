import { describe, expect, it } from 'vitest';
import { FEED_GAP, MAX_FEED_WIDTH, MIN_FEED_WIDTH, feedLayout, placeInFeeds } from '../../src/app/react/components/dm-screen/feedLayout';

describe('feedLayout', () => {
  it('fits two feeds into the statblock pane of a 1440 px window', () => {
    // 774 px is the pane of a 1440 px wide window; it used to wrap every feed below the first.
    expect(feedLayout(774, 4)).toEqual({ count: 2, width: 381 });
  });

  it('adds a feed as soon as another one fits at the minimum width', () => {
    const threeFeeds = 3 * MIN_FEED_WIDTH + 2 * FEED_GAP;
    expect(feedLayout(threeFeeds - 1, 6).count).toBe(2);
    expect(feedLayout(threeFeeds, 6)).toEqual({ count: 3, width: MIN_FEED_WIDTH });
  });

  it('shares the whole pane between the feeds, so none can wrap', () => {
    for (const pane of [360, 700, 774, 960, 1200, 1700]) {
      const { count, width } = feedLayout(pane, 12);
      expect(count * width + (count - 1) * FEED_GAP).toBeLessThanOrEqual(pane);
    }
  });

  it('never makes more feeds than there are statblocks', () => {
    expect(feedLayout(1700, 2).count).toBe(2);
    expect(feedLayout(1700, 1)).toEqual({ count: 1, width: MAX_FEED_WIDTH });
  });

  it('keeps one feed that fills a pane narrower than the minimum width', () => {
    expect(feedLayout(300, 4)).toEqual({ count: 1, width: 300 });
  });

  it('falls back to one feed while the pane is not measured', () => {
    expect(feedLayout(0, 4)).toEqual({ count: 1, width: MIN_FEED_WIDTH });
  });
});

describe('placeInFeeds', () => {
  it('puts the next statblock into the feed with the first free space', () => {
    // The first statblock is longer than the second, so the third goes under the second.
    const { placements, height } = placeInFeeds([400, 200, 300, 100], 2);
    expect(placements).toEqual([
      { feed: 0, top: 0 },
      { feed: 1, top: 0 },
      { feed: 1, top: 200 + FEED_GAP },
      { feed: 0, top: 400 + FEED_GAP },
    ]);
    expect(height).toBe(400 + FEED_GAP + 100);
  });

  it('never leaves a feed empty while another holds two statblocks', () => {
    const { placements } = placeInFeeds([900, 300, 300], 3);
    expect(placements.map((placement) => placement.feed)).toEqual([0, 1, 2]);
  });

  it('takes the leftmost feed when several are equally short', () => {
    expect(placeInFeeds([100, 100, 100], 2).placements.map((placement) => placement.feed)).toEqual([0, 1, 0]);
  });

  it('spreads statblocks over the feeds before their heights are known', () => {
    expect(placeInFeeds([0, 0, 0, 0], 2).placements.map((placement) => placement.feed)).toEqual([0, 1, 0, 1]);
  });

  it('stacks everything in one feed', () => {
    const { placements, height } = placeInFeeds([100, 50], 1);
    expect(placements).toEqual([{ feed: 0, top: 0 }, { feed: 0, top: 100 + FEED_GAP }]);
    expect(height).toBe(150 + FEED_GAP);
  });

  it('has no height without statblocks', () => {
    expect(placeInFeeds([], 2)).toEqual({ placements: [], height: 0 });
  });
});
