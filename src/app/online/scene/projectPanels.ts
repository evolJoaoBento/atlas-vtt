/**
 * The widget bar and initiative tracker as players receive them, following the
 * same rules as `PlayerWidgetBar` and `PlayerInitiativePanel` in the local window.
 */
import type { ViewAtlasState } from '../../storeFactory';
import { isSteppedWidget, readCounterValue } from '../../utils/counterWidget';
import { isWidgetOn } from '../../utils/widgetActivation';
import { finiteOr, oneOf, textOr, textOrNull } from './coerce';
import type { PlayerViewRules } from './playerViewRules';
import { PLAYER_WIDGET_TYPES, SCENE_LIMITS, type PlayerInitiative, type PlayerWidget } from './sceneTypes';
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

/** `visibleTokenIds`: the tokens players receive, so entries of hidden and fogged tokens are dropped. */
export function projectInitiative(
  state: InitiativeState,
  visibleTokenIds: ReadonlySet<string>,
  rules: PlayerViewRules,
): PlayerInitiative | null {
  const initiative = state.initiative;
  if (!rules.showInitiative || !state.initiativeTrackerOpen || !initiative) return null;
  const combat = initiative.isActive === true;
  const entries = (Array.isArray(initiative.entries) ? initiative.entries : [])
    .filter((entry) => typeof entry === 'object' && entry !== null && isSceneId(entry.id) && visibleTokenIds.has(entry.tokenId))
    .sort((a, b) => finiteOr(a.order, 0) - finiteOr(b.order, 0))
    .slice(0, SCENE_LIMITS.initiativeEntries)
    .map((entry) => ({
      id: entry.id,
      tokenId: entry.tokenId,
      initiative: finiteOr(entry.initiative, 0),
      name: rules.showTokenNameplates ? textOrNull(entry.name) : null,
      // Entries keep no HP since Atlas 0.5: it is a token resource, not sent yet.
      hp: null,
      isActive: combat && entry.isActive === true,
    }));
  return { round: finiteOr(initiative.round, 0), active: combat, entries };
}
