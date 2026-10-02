/** Names in the people list are compared like this: trimmed, case-insensitive. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** `name`, or `name (2)`, `name (3)`, … while `taken` says the name is used. */
export function uniqueName(name: string, taken: (key: string) => boolean): string {
  if (!taken(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken(nameKey(candidate))) return candidate;
  }
}
