/** Note properties that extensions keep out of collection exports and installs, by the extension that asked. */
class BundleNoteKeys {
  private readonly owners = new Map<symbol, ReadonlySet<string>>();
  private cached: ReadonlySet<string> | null = null;

  /** Registers `keys` for `owner`; the returned function removes them again, and calling it twice does nothing. */
  add(owner: string, keys: readonly string[]): () => void {
    const entry = Symbol(owner);
    this.owners.set(entry, new Set(keys.map((key) => key.trim().toLowerCase()).filter(Boolean)));
    this.cached = null;
    return (): void => {
      if (this.owners.delete(entry)) this.cached = null;
    };
  }

  /** Every registered key, lowercase. */
  keys(): ReadonlySet<string> {
    this.cached ??= new Set([...this.owners.values()].flatMap((keys) => [...keys]));
    return this.cached;
  }
}

export const bundleNoteKeys = new BundleNoteKeys();
