/**
 * Links in a shared note. A link to a note the receiver also gets points at that note's shared
 * title; every other link (and every embed of a file that is not a note) becomes its text, so
 * no name of an unshared note or file leaves the sender. Web links stay. Reference-style links
 * (`[text][ref]` with a `[ref]: target` line) are resolved like inline ones, and the HTML
 * attributes `href`, `src` and the like are dropped unless they point at the web.
 */

/** The title the receiver knows a link target by; null when they do not get it. */
export type LinkResolver = (linkpath: string) => string | null;

const WIKI_LINK = /(!?)\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g;
const LABEL = String.raw`((?:\\.|[^\[\]\\]|\[[^\[\]]*\])*)`;
const MARKDOWN_LINK = new RegExp(String.raw`(!?)\[${LABEL}\]\(([^)]*)\)`, 'g');
const REFERENCE_LINK = new RegExp(String.raw`(!?)\[${LABEL}\]\[([^\]]*)\]`, 'g');
const SHORTCUT_LINK = new RegExp(String.raw`(!?)\[${LABEL}\](?![(\[:])`, 'g');
const DEFINITION = /^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)]))*[ \t]*\[(?!\^)((?:\\.|[^\]\\])+)\]:[ \t]*(<[^>]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:|^\/\//i;
const HTML_TAG = /<[a-zA-Z][^>]*>/g;
const URL_ATTRIBUTE = /\s(?:href|src|srcset|poster|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;

const nameOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/i, '');
const isSize = (text: string): boolean => /^\d+(?:x\d+)?$/.test(text.trim());

function splitTarget(raw: string): { path: string; sub: string } {
  const at = raw.search(/[#^]/);
  return at < 0 ? { path: raw, sub: '' } : { path: raw.slice(0, at), sub: raw.slice(at) };
}

const cleanTarget = (raw: string): string => raw.trim().replace(/^<|>$/g, '').replace(/\s+"[^"]*"$/, '');

function decoded(target: string): string {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

/** The result of a link to `target` with `label`, or null when it points at the web and stays as written. */
function rewriteTarget(bang: string, label: string, rawTarget: string, resolve: LinkResolver): string | null {
  const target = cleanTarget(rawTarget);
  if (EXTERNAL.test(target)) return null;
  const { path, sub } = splitTarget(decoded(target));
  const title = path ? resolve(path) : null;
  if (!title) return label;
  return bang ? `![[${title}${sub}]]` : `[[${title}${sub}|${label}]]`;
}

function rewriteWiki(text: string, resolve: LinkResolver): string {
  return text.replace(WIKI_LINK, (_all: string, bang: string, raw: string, alias: string | undefined): string => {
    const { path, sub } = splitTarget(raw.trim());
    const title = path ? resolve(path) : null;
    if (title) return `${bang}[[${title}${sub}${alias !== undefined ? `|${alias}` : ''}]]`;
    if (alias !== undefined && !(bang && isSize(alias))) return alias;
    return path ? nameOf(path) : sub.replace(/^[#^]/, '');
  });
}

/** Link reference definitions: the ones that point at files are taken out; their labels map to their targets. */
function takeDefinitions(lines: readonly string[]): { kept: string[]; targets: Map<string, string> } {
  const targets = new Map<string, string>();
  const kept: string[] = [];
  for (const line of lines) {
    const match = DEFINITION.exec(line);
    const target = match ? cleanTarget(match[2] ?? '') : '';
    if (!match || EXTERNAL.test(target)) {
      kept.push(line);
      continue;
    }
    targets.set((match[1] ?? '').trim().toLowerCase(), target);
  }
  return { kept, targets };
}

function rewriteReferences(text: string, targets: ReadonlyMap<string, string>, resolve: LinkResolver): string {
  const through = (all: string, bang: string, label: string, key: string): string => {
    const target = targets.get(key.trim().toLowerCase());
    return target === undefined ? all : rewriteTarget(bang, label, target, resolve) ?? all;
  };
  return text
    .replace(REFERENCE_LINK, (all: string, bang: string, label: string, ref: string) => through(all, bang, label, ref === '' ? label : ref))
    .replace(SHORTCUT_LINK, (all: string, bang: string, label: string) => through(all, bang, label, label));
}

function stripHtmlUrls(text: string): string {
  return text.replace(HTML_TAG, (tag) => tag.replace(URL_ATTRIBUTE, (all: string, double?: string, single?: string, bare?: string) => {
    const value = (double ?? single ?? bare ?? '').trim();
    const urls = value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '');
    return urls.every((url) => EXTERNAL.test(url) || url.startsWith('#')) ? all : '';
  }));
}

export function rewriteLinks(text: string, resolve: LinkResolver): string {
  const { kept, targets } = takeDefinitions(rewriteWiki(text, resolve).split('\n'));
  const inline = rewriteReferences(kept.join('\n'), targets, resolve).replace(MARKDOWN_LINK, (all: string, bang: string, label: string, raw: string) =>
    rewriteTarget(bang, label, raw, resolve) ?? all);
  return stripHtmlUrls(inline);
}
