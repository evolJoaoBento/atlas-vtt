/** Removes a registration; calling it again does nothing. */
export type Disposer = () => void;

/** An Atlas map view (`AtlasView.viewId`); never reused once the view closed. */
export type ViewId = string;

export interface Point {
  x: number;
  y: number;
}

export type AtlasCapability =
  | 'views' | 'presentation' | 'rules' | 'lighting' | 'tokens' | 'dice'
  | 'lasers' | 'ui' | 'scenes' | 'bundles' | 'settings' | 'storage' | 'remote-view';

/** Plain JSON: all an extension may keep on Atlas's records. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
