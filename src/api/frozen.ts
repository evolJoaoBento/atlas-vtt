function freezeDeep(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const inner of Object.values(value)) freezeDeep(inner);
}

/**
 * What the API hands out when the value is not already immutable store data: a deep copy, deeply frozen,
 * so an extension can never change Atlas's own state through it.
 */
export function frozenCopy<T>(value: T): T {
  const copy = structuredClone(value);
  freezeDeep(copy);
  return copy;
}
