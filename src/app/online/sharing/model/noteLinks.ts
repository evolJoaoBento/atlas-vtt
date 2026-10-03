/**
 * Links in a shared note. A link to a note the receiver also gets points at that note's shared
 * title; every other link (and every embed of a file that is not a note) becomes its text, so
 * no name of an unshared note or file leaves the sender. Only web links stay (`https`, `mailto`
 * and the like): `obsidian://`, `app://` and `file://` carry vault names and paths. Reference-style
 * links (`[text][ref]` with a `[ref]: target` line) are resolved like inline ones, a link around an
 * image is rewritten from the inside out, and the HTML attributes `href`, `src` and the like are
 * dropped unless they point at the web.
 */

/** The title the receiver knows a link target by; null when they do not get it. */
export type LinkResolver = (linkpath: string) => string | null;

const WIKI_LINK = /(!?)\[\[([^\]|]*?)(?:\|([^\]]*))?\]\]/g;
const LABEL = String.raw`((?:\\.|[^\[\]\\]|\[[^\[\]]*\])*)`;
const MARKDOWN_LINK = new RegExp(String.raw`(!?)\[${LABEL}\]\(([^)]*)\)`, 'g');
const REFERENCE_LINK = new RegExp(String.raw`(!?)\[${LABEL}\]\[([^\]]*)\]`, 'g');
const SHORTCUT_LINK = new RegExp(String.raw`(!?)\[${LABEL}\](?![(\[:])`, 'g');
const DEFINITION_HEAD = String.raw`^(?:[ \t]*(?:>|[-*+]|\d{1,9}[.)]))*[ \t]*\[(?!\^)((?:\\.|[^\]\\])+)\]:`;
const DEFINITION = new RegExp(String.raw`${DEFINITION_HEAD}[ \t]*(<[^>]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$`);
/** A definition whose target is on the next line. */
const DEFINITION_ALONE = new RegExp(String.raw`${DEFINITION_HEAD}[ \t]*$`);
const TARGET_LINE = /^[ \t]*(<[^>]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/;
const TITLE_LINE = /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))[ \t]*$/;
/** Targets that stay as written. */
const WEB = /^(?:https?|mailto|tel|ftp|data):|^\/\//i;
const HTML_TAG = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g;
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
  if (WEB.test(target)) return null;
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
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? '';
    const alone = DEFINITION_ALONE.exec(line);
    const next = alone ? TARGET_LINE.exec(lines[at + 1] ?? '') : null;
    const match = DEFINITION.exec(line);
    const label = match?.[1] ?? alone?.[1];
    const target = cleanTarget(match?.[2] ?? next?.[1] ?? '');
    if (label === undefined || target === '' || WEB.test(target)) {
      kept.push(line);
      continue;
    }
    targets.set(label.trim().toLowerCase(), target);
    if (next) at += TITLE_LINE.test(lines[at + 2] ?? '') ? 2 : 1;
  }
  return { kept, targets };
}

/** Reference and inline links, each rewritten from the inside out so a link around an image leaks neither path. */
function rewriteSpans(text: string, targets: ReadonlyMap<string, string>, resolve: LinkResolver): string {
  const inside = (label: string): string => rewriteSpans(label, targets, resolve);
  const through = (all: string, bang: string, label: string, ref: string): string => {
    const target = targets.get(ref.trim().toLowerCase());
    return target === undefined ? all : rewriteTarget(bang, inside(label), target, resolve) ?? all;
  };
  return text
    .replace(REFERENCE_LINK, (all: string, bang: string, label: string, ref: string) => through(all, bang, label, ref === '' ? label : ref))
    .replace(SHORTCUT_LINK, (all: string, bang: string, label: string) => through(all, bang, label, label))
    .replace(MARKDOWN_LINK, (all: string, bang: string, label: string, raw: string) => {
      const inner = inside(label);
      return rewriteTarget(bang, inner, raw, resolve) ?? (inner === label ? all : `${bang}[${inner}](${raw})`);
    });
}

function stripHtmlUrls(text: string): string {
  return text.replace(HTML_TAG, (tag) => tag.replace(URL_ATTRIBUTE, (all: string, double?: string, single?: string, bare?: string) => {
    const value = (double ?? single ?? bare ?? '').trim();
    const urls = value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '');
    return urls.every((url) => WEB.test(url) || url.startsWith('#')) ? all : '';
  }));
}

const MAX_PASSES = 8;

/** Runs `pass` until it changes nothing, at most `MAX_PASSES` times. */
function untilStable(text: string, pass: (text: string) => string): string {
  let current = text;
  for (let count = 0; count < MAX_PASSES; count++) {
    const next = pass(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** The last net: any inline link or image still aimed at something that is not the web becomes its text, however deeply nested. */
const sweep = (text: string): string =>
  untilStable(text, (current) => current.replace(MARKDOWN_LINK, (all: string, _bang: string, label: string, raw: string) => (WEB.test(cleanTarget(raw)) ? all : label)));

export function rewriteLinks(text: string, resolve: LinkResolver): string {
  const { kept, targets } = takeDefinitions(rewriteWiki(text, resolve).split('\n'));
  const rewritten = untilStable(kept.join('\n'), (current) => rewriteSpans(current, targets, resolve));
  return stripHtmlUrls(sweep(rewritten));
}
