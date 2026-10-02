/** A note's frontmatter, split off and reduced to the properties that may be shared. Text only, never parsed as YAML. */
import { SHARE_PROPERTY } from './shareRule';

export function splitFrontmatter(text: string): { frontmatter: string[] | null; body: string } {
  const lines = text.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { frontmatter: null, body: text };
  const end = lines.findIndex((line, index) => index > 0 && (line.trimEnd() === '---' || line.trimEnd() === '...'));
  if (end < 0) return { frontmatter: null, body: text };
  return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

const TOP_LEVEL_KEY = /^("[^"]+"|'[^']+'|[^\s#:'"-][^:]*?):(?:\s|$)/;

/** The lines of the top-level properties named in `keep` (case-insensitive), never `atlas-share`; comments and unreadable lines go. */
export function keepProperties(lines: readonly string[], keep: readonly string[]): string[] {
  const wanted = new Set(keep.map((key) => key.trim().toLowerCase()).filter((key) => key && key !== SHARE_PROPERTY));
  const out: string[] = [];
  let keeping = false;
  for (const line of lines) {
    const key = TOP_LEVEL_KEY.exec(line)?.[1];
    if (key !== undefined) {
      keeping = wanted.has(key.replace(/^["']|["']$/g, '').trim().toLowerCase());
      if (keeping) out.push(line);
    } else if (/^\S/.test(line) && !/^-(\s|$)/.test(line)) {
      keeping = false; // a comment or a line we cannot read at the top level
    } else if (keeping) {
      out.push(line);
    }
  }
  return out;
}
