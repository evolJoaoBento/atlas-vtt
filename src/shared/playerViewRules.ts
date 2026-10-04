/** The four `localPlayerView` rules online players follow, as the player window does. */
export const PLAYER_VIEW_RULE_KEYS = ['showGrid', 'showTokenNameplates', 'showWidgets', 'showInitiative'] as const;
export type PlayerViewRuleKey = (typeof PLAYER_VIEW_RULE_KEYS)[number];
