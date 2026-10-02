/**
 * The sender's side of sharing: what a recipient may list and open, built fresh from the vault
 * each time, filtered for them before it is hashed. A version is the SHA-256 of exactly what
 * would be sent, so an edit to a part they never get never shows them an update.
 */
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import { mimeForPath, sha256Id, type AssetMime, type Hasher } from '../../assets/assetIds';
import type { ImageFiles } from '../../scene/AssetRegistry';
import type { PlayerViewRules } from '../../scene/playerViewRules';
import type { MapSize } from '../../scene/sceneTypes';
import type { PeopleBook } from '../people/PeopleBook';
import type { Recipient } from './audience';
import { fullPayload, hashMapImages, playerSafePayload, type MapImages } from './buildMapPayload';
import { accessFor, type Access, type AccessSources, type MapAccess } from './catalogueAccess';
import type { MapShareMode } from './mapShare';
import { filterNoteFor } from './noteFilter';
import type { ShareItems } from './ShareItems';

export const MAX_CATALOGUE_ITEMS = 500;

export interface CatalogueItem {
  item: string;
  kind: 'note' | 'map';
  title: string;
  version: string;
  size: number;
  mode?: MapShareMode;
  /** A map's ticked notes, as item ids. */
  linked?: string[];
}

export interface SharePayload {
  kind: 'note' | 'map' | 'image';
  bytes: ArrayBuffer;
  version: string;
  mime?: AssetMime;
}

export interface CatalogueSources extends AccessSources {
  read(path: string): Promise<string>;
  images: ImageFiles;
  isFile(path: string): boolean;
  /** The vault path a link in `from` points at; null when it resolves to nothing. */
  resolveLink(linkpath: string, from: string): string | null;
  shareable(): readonly string[];
  rules(): PlayerViewRules;
  collectionGrid(mapPath: string): CollectionGridDefaults | null;
}

function utf8(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return bytes;
}

export class SenderCatalogue {
  constructor(
    private readonly sources: CatalogueSources,
    private readonly items: Pick<ShareItems, 'idFor' | 'pathOf' | 'ready'>,
    private readonly people: Pick<PeopleBook, 'byName' | 'byKey' | 'ready'>,
    private readonly hash: Hasher = sha256Id,
    private readonly dimensions?: (bytes: ArrayBuffer) => Promise<MapSize | null>,
  ) {}

  /** The access of one recipient, once the stored ids and people are read. */
  private async access(recipient: Recipient): Promise<Access> {
    await Promise.all([this.items.ready(), this.people.ready()]);
    return accessFor(this.sources, recipient, this.people);
  }

  async list(recipient: Recipient): Promise<CatalogueItem[]> {
    const access = await this.access(recipient);
    const items: CatalogueItem[] = [];
    for (const note of access.notes.values()) {
      if (items.length >= MAX_CATALOGUE_ITEMS) break;
      const payload = await this.notePayload(note.path, recipient, access);
      items.push({ item: this.items.idFor(note.path), kind: 'note', title: note.title, version: payload.version, size: payload.bytes.byteLength });
    }
    for (const map of access.maps) {
      if (items.length >= MAX_CATALOGUE_ITEMS) break;
      const { version, bytes } = await this.mapPayload(map);
      items.push({
        item: map.entry.share.item, kind: 'map', title: map.entry.name, version, size: bytes.byteLength,
        mode: map.entry.share.mode, linked: map.linked.map((path) => this.items.idFor(path)),
      });
    }
    return items;
  }

  /** A note, a map, or a map's image (`<map item>/<fingerprint>`), when this recipient may have it; null otherwise. */
  async open(recipient: Recipient, ref: string): Promise<SharePayload | null> {
    const access = await this.access(recipient);
    const slash = ref.indexOf('/');
    if (slash >= 0) return this.image(access, ref.slice(0, slash), ref.slice(slash + 1));
    const map = access.maps.find((candidate) => candidate.entry.share.item === ref);
    if (map) return (await this.mapPayload(map)).payload;
    const path = this.items.pathOf(ref);
    return path && access.notes.has(path) ? this.notePayload(path, recipient, access) : null;
  }

  /** The note as this person would get it, whatever its rule says now (the dialog's preview). */
  async previewNote(recipient: Recipient, path: string): Promise<string> {
    return this.noteText(path, recipient, await this.access(recipient));
  }

  private async noteText(path: string, recipient: Recipient, access: Access): Promise<string> {
    return filterNoteFor(await this.sources.read(path), {
      recipient, people: this.people, shareable: this.sources.shareable(),
      links: (linkpath) => {
        const target = this.sources.resolveLink(linkpath, path);
        return target ? access.notes.get(target)?.title ?? null : null;
      },
    });
  }

  private async notePayload(path: string, recipient: Recipient, access: Access): Promise<SharePayload> {
    const bytes = utf8(await this.noteText(path, recipient, access));
    return { kind: 'note', bytes, version: await this.hash(bytes) };
  }

  private async mapPayload(map: MapAccess): Promise<{ payload: SharePayload; images: MapImages; version: string; bytes: ArrayBuffer }> {
    const images = await hashMapImages(map.source.map, this.sources.images, this.hash, this.dimensions);
    const linked = new Set(map.linked);
    const context = {
      rules: this.sources.rules(), collectionGrid: this.sources.collectionGrid(map.entry.mapPath), images,
      noteItem: (path: string): string | null => (linked.has(path) ? this.items.idFor(path) : null),
      linked: map.linked.map((path) => this.items.idFor(path)),
      isFile: (path: string): boolean => this.sources.isFile(path),
    };
    const built = map.entry.share.mode === 'full'
      ? fullPayload(map.source, map.entry.name, context)
      : playerSafePayload(map.source, map.entry.name, context);
    const bytes = utf8(JSON.stringify(built));
    const version = await this.hash(bytes);
    return { payload: { kind: 'map', bytes, version }, images, version, bytes };
  }

  private async image(access: Access, mapItem: string, fingerprint: string): Promise<SharePayload | null> {
    const map = access.maps.find((candidate) => candidate.entry.share.item === mapItem);
    if (!map) return null;
    const { payload, images } = await this.mapPayload(map);
    const sent: { images: string[] } = JSON.parse(new TextDecoder().decode(payload.bytes)) as { images: string[] };
    if (!sent.images.includes(fingerprint)) return null;
    const path = [...images.fingerprints].find(([, id]) => id === fingerprint)?.[0];
    const mime = path ? mimeForPath(path) : null;
    if (!path || !mime) return null;
    const bytes = await this.sources.images.read(path);
    return (await this.hash(bytes)) === fingerprint ? { kind: 'image', bytes, version: fingerprint, mime } : null;
  }
}
