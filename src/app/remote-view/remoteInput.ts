/**
 * What a remote view takes from its owner, checked whole before anything is written: a malformed
 * input throws and changes nothing. Numbers that reach the viewport or the ruler must be finite
 * and in range; text stays text.
 */
import { frozenCopy } from '../../api/frozen';
import type { RemotePlayerState, RemoteSceneInput } from '../../api/types/remoteViews';
import { isValidConeAngle, type MeasurementSettings } from '../grid/measurementFormat';

/** The largest map side a remote scene may have, in world pixels. */
export const MAX_REMOTE_MAP_SIDE = 100_000;

const MODES: readonly unknown[] = ['metric', 'abstract'];
const UNITS: readonly unknown[] = ['feet', 'yards', 'meters', 'units', 'custom'];
const DIAGONALS: readonly unknown[] = ['equidistant', 'alternating', 'euclidean'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isSide = (value: unknown): boolean => isFiniteNumber(value) && value >= 0 && value <= MAX_REMOTE_MAP_SIDE;
const isUrl = (value: unknown): boolean => value === null || typeof value === 'string';

function fail(method: string, what: string): never {
  throw new Error(`RemoteView.${method}: ${what}.`);
}

export function checkedScene(scene: unknown): RemoteSceneInput | null {
  if (scene === null) return null;
  const objects = isObject(scene) ? scene.objects : null;
  const shaped = isObject(scene) && isObject(scene.background) && isObject(objects) && isObject(scene.widgets)
    && isObject(scene.tokenImages) && isObject(scene.initiative) && (scene.grid === null || isObject(scene.grid))
    && ['tokens', 'texts', 'drawings', 'fog'].every((kind) => isObject(objects[kind]));
  if (!shaped) fail('setScene', 'the scene must be a RemoteSceneInput, or null');
  const background = scene.background as Record<string, unknown>;
  const tokenImages = scene.tokenImages as Record<string, unknown>;
  if (!isUrl(background.url)) fail('setScene', '"background.url" must be a string or null');
  if (!isSide(background.width) || !isSide(background.height)) {
    fail('setScene', `"background.width" and "background.height" must be numbers from 0 to ${MAX_REMOTE_MAP_SIDE}`);
  }
  if (!Object.values(tokenImages).every(isUrl)) fail('setScene', 'every "tokenImages" value must be a string or null');
  return scene as unknown as RemoteSceneInput;
}

function isMeasurement(value: unknown): value is MeasurementSettings {
  return isObject(value) && MODES.includes(value.mode) && UNITS.includes(value.unitType) && DIAGONALS.includes(value.diagonalRule)
    && isFiniteNumber(value.unitDistance) && value.unitDistance > 0 && isValidConeAngle(value.coneAngle)
    && Array.isArray(value.rangeBands) && value.rangeBands.every((band) => isObject(band) && typeof band.name === 'string' && isFiniteNumber(band.maxSquares));
}

const isDefinition = (value: unknown): boolean => isObject(value) && typeof value.key === 'string' && typeof value.visibleToPlayers === 'boolean';
const isCondition = (value: unknown): boolean => isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
const isHealth = (value: unknown): boolean => isObject(value) && isFiniteNumber(value.value) && isFiniteNumber(value.max);

/** The player's state, checked and copied (deep, frozen). */
export function checkedPlayer(state: unknown): RemotePlayerState {
  if (!isObject(state) || !isObject(state.tokenUi) || !isObject(state.initiative)) fail('setPlayer', 'the state must be a RemotePlayerState');
  const { movableTokenIds, measurement, tokenUi, initiative } = state;
  if (!Array.isArray(movableTokenIds) || !movableTokenIds.every((id) => typeof id === 'string')) fail('setPlayer', '"movableTokenIds" must be a list of token ids');
  if (!isMeasurement(measurement)) fail('setPlayer', '"measurement" must be MeasurementSettings with a distance above 0 and a cone of 1 to 360 degrees');
  if (!Array.isArray(tokenUi.conditions) || !tokenUi.conditions.every(isCondition)) fail('setPlayer', '"tokenUi.conditions" must be condition definitions');
  const resources = tokenUi.resources;
  if (!isObject(resources) || !Object.values(resources).every((list) => Array.isArray(list) && list.every(isDefinition))) {
    fail('setPlayer', '"tokenUi.resources" must list resource definitions by token id');
  }
  if (initiative.rules !== null && !isObject(initiative.rules)) fail('setPlayer', '"initiative.rules" must be InitiativeRules or null');
  if (!isObject(initiative.health) || !Object.values(initiative.health).every(isHealth)) fail('setPlayer', '"initiative.health" values must be { value, max } numbers');
  return frozenCopy(state as unknown as RemotePlayerState);
}
