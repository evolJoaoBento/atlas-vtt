/** How a downed token looks, shared by Atlas's overlay and the online player page; no PIXI imports. */
export const DOWNED_LOOK = {
  /** The skull's height as a share of the token's diameter. */
  skullShare: 0.46,
  /** The skull is a quiet marker: the grey token already says most of it. */
  markerOpacity: 0.72,
} as const;
