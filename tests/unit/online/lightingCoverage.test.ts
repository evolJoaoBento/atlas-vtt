import { describe, expect, it } from 'vitest';
import {
  LIGHTING_STATE_COVERAGE, OBJECT_COVERAGE, SCENE_LIGHTING_COVERAGE, TOKEN_FIELD_COVERAGE, type Coverage, type CoverageTable,
} from '../../../src/app/online/coverage';
import type { PlayerScene } from '../../../src/app/online/scene/sceneTypes';
import { GENERIC_SENSES } from '../../../src/app/gameSystems/senses/generic';
import { seeing } from '../../../src/app/gameSystems/senses/senseHelpers';
import type { SenseDefinition } from '../../../src/app/types/senseTypes';
import type { SightRules } from '../../../src/app/vision/sightRules';
import { exploredImage, light, lightingFrameOf, MAP, project, scene, wall, type Scene } from './lightingFixtures';

type Pairs<K extends string> = Record<K, { before: Scene; after: Scene; rules?: SightRules }>;

/** Night, a torch at (400, 400), the hero seeing at (140, 400) and an explored strip on the right. */
const night = (): Scene => ({
  ...scene({ ambient: 0 }, { lights: { torch: light('torch', 400, 400) } }),
  exploredMask: 'data:image/png;base64,AA',
});
const explored = exploredImage(MAP, (x) => x > 800);

/** As the broadcaster projects: the view's lighting from the store, the saved memory decoded. */
function projectLit(state: Scene, rules?: SightRules): PlayerScene {
  return project(state, lightingFrameOf(state, MAP, state.exploredMask ? explored : null, rules));
}

const withObjects = (objects: Partial<Scene['objects']>, base = night()): Scene => ({ ...base, objects: { ...base.objects, ...objects } });
const withLighting = (lighting: Partial<Scene['lighting']>, base = night()): Scene => ({ ...base, lighting: { ...base.lighting, ...lighting } });
const withHero = (patch: Record<string, unknown>, base = night()): Scene => withObjects({ tokens: { hero: { ...base.objects.tokens.hero!, ...patch } } }, base);

/**
 * With lighting on: a `lighting` entry changes what players receive, a `gm-only` or `not-yet`
 * one does not. (Without lighting none of them does: `coverage.test.ts`.)
 */
function expectLitCoverage<K extends string>(table: CoverageTable<K>, pairs: Partial<Pairs<K>>, keys: readonly K[] = Object.keys(table) as K[]): void {
  for (const key of keys) {
    const pair = pairs[key];
    const coverage: Coverage = table[key];
    expect(pair, `a pair for ${key}`).toBeDefined();
    const before = projectLit(pair!.before, pair!.rules);
    const after = projectLit(pair!.after, pair!.rules);
    if (coverage.status === 'lighting') expect(after, `${key} is marked lighting`).not.toEqual(before);
    else expect(after, `${key} is marked ${coverage.status}`).toEqual(before);
  }
}

/** A sense that sees in bright light only and does not use the eyes: the bright threshold decides what it sees. */
const GLARE: SenseDefinition = {
  id: 'glare', name: 'Glare sight', description: 'Sees in bright light only.',
  ...seeing({ bright: 'normal', dim: 'none', dark: 'none', magicalDark: 'none' }), worksWhileBlinded: true, range: 'optional',
};

describe('coverage of dynamic lighting', () => {
  it('lets walls, lights and light zones decide what players see', () => {
    const lightingKinds = ['walls', 'lights', 'lightZones'] as const;
    expect(lightingKinds.every((kind) => OBJECT_COVERAGE[kind].status === 'lighting')).toBe(true);
    expectLitCoverage(OBJECT_COVERAGE, {
      walls: { before: night(), after: withObjects({ walls: { w: wall('w', { x: 263, y: 0 }, { x: 263, y: 800 }) } }) },
      lights: { before: night(), after: withObjects({ lights: { ...night().objects.lights, far: light('far', 700, 200) } }) },
      lightZones: {
        before: night(),
        after: withObjects({ lightZones: { day: { id: 'day', kind: 'light-zone', polygon: [{ x: 500, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 300 }], ambient: 1 } } }),
      },
    }, lightingKinds);
  });

  it('lets how a token sees and the light it carries decide what players see', () => {
    expectLitCoverage(TOKEN_FIELD_COVERAGE, {
      vision: { before: night(), after: withHero({ vision: { enabled: true, angle: 90 } }) },
      light: { before: night(), after: withHero({ light: light('', 0, 0, 20).emission }) },
    }, ['vision', 'light']);
  });

  it('lets the scene\'s lighting options decide, and never its looks', () => {
    // The hero was dragged across a wall: with sight on drop it still sees from where the drag began.
    const behindWall = { w: wall('w', { x: 263, y: 0 }, { x: 263, y: 800 }) };
    const held = (base: Scene): Scene => ({ ...withObjects({ walls: behindWall }, withHero({ x: 600 }, base)), heldTokens: { hero: { x: 140, y: 400 } } });
    const glare = (lighting: Partial<Scene['lighting']>): Scene => withHero({ vision: { enabled: true, range: 0, senses: [{ id: 'glare' }] } }, withLighting({ ambient: 0.5, ...lighting }));
    expectLitCoverage(SCENE_LIGHTING_COVERAGE, {
      enabled: { before: night(), after: withLighting({ enabled: false }) },
      ambient: { before: night(), after: withLighting({ ambient: 1 }) },
      ambientColor: { before: night(), after: withLighting({ ambientColor: '#ff0000' }) },
      tokenVision: { before: night(), after: withLighting({ tokenVision: false }) },
      exploredMemory: { before: night(), after: withLighting({ exploredMemory: false }) },
      exploredColor: { before: night(), after: withLighting({ exploredColor: '#ff0000' }) },
      unexploredColor: { before: night(), after: withLighting({ unexploredColor: '#00ff00' }) },
      litThreshold: { before: night(), after: withLighting({ litThreshold: 0 }) },
      sightOnDrop: { before: held(night()), after: held(withLighting({ sightOnDrop: true })) },
      brightThreshold: { before: glare({}), after: glare({ brightThreshold: 0.4 }), rules: { definitions: [...GENERIC_SENSES, GLARE], conditions: [] } },
      darkSightLook: { before: night(), after: withLighting({ darkSightLook: 'grey' }) },
      darkSightTint: { before: night(), after: withLighting({ darkSightTint: '#336699' }) },
    });
  });

  it('lets the store fields the lighting reads decide, never the count of memory edits', () => {
    const dropping = withObjects({ walls: { w: wall('w', { x: 263, y: 0 }, { x: 263, y: 800 }) } }, withLighting({ sightOnDrop: true }, withHero({ x: 600 })));
    expectLitCoverage(LIGHTING_STATE_COVERAGE, {
      lighting: { before: night(), after: withLighting({ ambient: 1 }) },
      exploredMask: { before: night(), after: { ...night(), exploredMask: null } },
      exploredEdits: { before: night(), after: { ...night(), exploredEdits: 4 } as Scene },
      heldTokens: { before: dropping, after: { ...dropping, heldTokens: { hero: { x: 140, y: 400 } } } },
    });
  });

});
