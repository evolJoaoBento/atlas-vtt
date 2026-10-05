/** Fit map in each open remote view, by view id: the remote view fits through its camera (`ViewportFollower`). */
const fits = new Map<string, () => void>();

/** Registers how the remote view `viewId` fits its map; returns the removal. */
export function registerRemoteFit(viewId: string, fit: () => void): () => void {
  fits.set(viewId, fit);
  return () => { if (fits.get(viewId) === fit) fits.delete(viewId); };
}

/** Fits the map of the remote view `viewId`; false for any other view, which fits as a map view does. */
export function fitRemoteMap(viewId: string | undefined): boolean {
  const fit = viewId === undefined ? undefined : fits.get(viewId);
  if (!fit) return false;
  fit();
  return true;
}
