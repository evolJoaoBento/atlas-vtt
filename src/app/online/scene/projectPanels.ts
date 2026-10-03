/**
 * The widget bar and initiative tracker as players receive them, following the
 * same rules as `PlayerWidgetBar` and `PlayerInitiativePanel` in the local window.
 */
import { DEFAULT_INITIATIVE_RULES } from '../../gameSystems/initiativeRules';
import { listedBySides, sideOf } from '../../initiative/sides';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { ViewAtlasState } from '../../storeFactory';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import { isSteppedWidget, readCounterValue } from '../../utils/counterWidget';
import { isWidgetOn } from '../../utils/widgetActivation';
import { finiteOr, oneOf, textOr, textOrNull } from './coerce';
import type { PlayerViewRules } from './playerViewRules';
import { initiativeShare } from './projectResources';
import {
  PLAYER_SIDES, PLAYER_WIDGET_TYPES, SCENE_LIMITS, type PlayerInitiative, type PlayerInitiativeSides, type PlayerSide, type PlayerWidget,
} from './sceneTypes';
import { isSceneId } from './sceneValidation';

type WidgetState = Pick<ViewAtlasState, 'widgetSettings' | 'widgetValues'>;
type InitiativeState = Pick<ViewAtlasState, 'initiative' | 'initiativeTrackerOpen'>;

export function projectWidgets(state: WidgetState, rules: PlayerViewRules): PlayerWidget[] {
  const settings = state.widgetSettings;
  if (!rules.showWidgets || !settings?.globalVisible) return [];
  return Object.values(settings.widgets ?? {})
    .filter((widget) => typeof widget === 'object' && widget !== null && isSceneId(widget.id)
      && isWidgetOn(settings, widget) && widget.visibleToPlayers === true)
    .sort((a, b) => finiteOr(a.order, 0) - finiteOr(b.order, 0))
    .slice(0, SCENE_LIMITS.widgets)
    .map((widget) => ({
      id: widget.id,
      type: oneOf(PLAYER_WIDGET_TYPES, widget.type, 'counter'),
      label: textOr(widget.label, ''),
      icon: textOr(widget.icon, ''),
      value: finiteOr(isSteppedWidget(widget) ? readCounterValue(state, widget) : widget.value, 0),
    }));
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * How the player window groups the initiative list, or null when it lists it in turn order (or
 * shows no list): `listedBySides` decides, from the fight's own mode while it runs and from the
 * collection's rules before it, and the first side is the fight's, else the rules'.
 */
export function projectSides(state: InitiativeState, rules: PlayerViewRules, initiativeRules: InitiativeRules): PlayerInitiativeSides | null {
  const initiative = state.initiative;
  if (!rules.showInitiative || !state.initiativeTrackerOpen || !initiative) return null;
  const stored: Record<string, unknown> | undefined = isRecord(initiative.sides) ? initiative.sides : undefined;
  if (!listedBySides({ isActive: initiative.isActive === true, ...(stored && { sides: stored as NonNullable<typeof initiative.sides> }) }, initiativeRules)) return null;
  const first = oneOf(PLAYER_SIDES, stored?.first, oneOf(PLAYER_SIDES, initiativeRules.firstSide, 'players'));
  const active = PLAYER_SIDES.find((side) => side === stored?.active);
  return active ? { first, active } : { first };
}

/**
 * The side of every token that has an initiative entry, as the window files it
 * (`sideOf`); empty unless the list is by sides, since only then is a side shown.
 */
export function combatantSides(state: InitiativeState & Partial<Pick<ViewAtlasState, 'objects'>>, sides: PlayerInitiativeSides | null): ReadonlyMap<string, PlayerSide> {
  const result = new Map<string, PlayerSide>();
  const entries = state.initiative?.entries;
  if (!sides || !Array.isArray(entries)) return result;
  const tokens = state.objects?.tokens ?? {};
  for (const entry of entries.slice(0, SCENE_LIMITS.initiativeEntries * 4)) {
    const tokenId: unknown = isRecord(entry) ? entry.tokenId : undefined;
    if (typeof tokenId === 'string' && Object.hasOwn(tokens, tokenId)) result.set(tokenId, sideOf(tokens[tokenId]));
  }
  return result;
}

/**
 * `visibleTokenIds`: the tokens players receive, so entries of hidden and fogged tokens are dropped.
 * `definitions`: the map's resources, which decide the bar after an entry's name (`initiativeShare`).
 * `initiativeRules`: the map's collection's, which say whether a fight not yet started is listed by sides.
 *
 * By sides the window shows no numbers and no active combatant, so none is sent: every number is 0.
 */
export function projectInitiative(
  state: InitiativeState & Partial<Pick<ViewAtlasState, 'objects'>>,
  visibleTokenIds: ReadonlySet<string>,
  rules: PlayerViewRules,
  definitions: readonly ResourceDefinition[] = [],
  initiativeRules: InitiativeRules = DEFAULT_INITIATIVE_RULES,
): PlayerInitiative | null {
  const initiative = state.initiative;
  if (!rules.showInitiative || !state.initiativeTrackerOpen || !initiative) return null;
  const combat = initiative.isActive === true;
  const sides = projectSides(state, rules, initiativeRules);
  const tokens = state.objects?.tokens ?? {};
  const entries = (Array.isArray(initiative.entries) ? initiative.entries : [])
    .filter((entry) => typeof entry === 'object' && entry !== null && isSceneId(entry.id) && visibleTokenIds.has(entry.tokenId))
    .sort((a, b) => finiteOr(a.order, 0) - finiteOr(b.order, 0))
    .slice(0, SCENE_LIMITS.initiativeEntries)
    .map((entry) => ({
      id: entry.id,
      tokenId: entry.tokenId,
      initiative: sides ? 0 : finiteOr(entry.initiative, 0),
      name: rules.showTokenNameplates ? textOrNull(entry.name) : null,
      // Entries keep no HP since Atlas 0.5: the bar is the token's `hp` resource, as the player window draws it.
      hp: null,
      hpShare: initiativeShare(Object.hasOwn(tokens, entry.tokenId) ? tokens[entry.tokenId] : undefined, definitions),
      isActive: !sides && combat && entry.isActive === true,
      ...(entry.sitsOut === true && { sitsOut: true as const }),
    }));
  return { round: finiteOr(initiative.round, 0), active: combat, entries, ...(sides && { sides }) };
}
