import type { Operation } from '@pb/schema';
import type { SiteState } from './types.ts';

/**
 * Code mode: index.html is shown with every section between markers
 *   <!-- pb:section id="projects" --> … <!-- /pb:section -->
 * Editing inside a section turns it into a custom section; the rest of the page is
 * generated (edit it through the panels, custom.css or custom.js).
 */
export interface Region {
  id: string;
  /** Text between the markers. */
  body: string;
  /** 1-based line of the opening marker. */
  line: number;
}

export interface Parsed {
  regions: Region[];
  /** Everything outside the sections, with each section replaced by its id. */
  outside: string;
}

export class CodeError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

const OPEN = /<!--\s*pb:section\s+id="([^"]+)"\s*-->/g;
const CLOSE = '<!-- /pb:section -->';

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

export function parseSections(html: string): Parsed {
  const regions: Region[] = [];
  let outside = '';
  let pos = 0;
  OPEN.lastIndex = 0;
  for (let m = OPEN.exec(html); m; m = OPEN.exec(html)) {
    const start = m.index;
    if (start < pos) continue;
    const bodyStart = start + m[0].length;
    const close = html.indexOf(CLOSE, bodyStart);
    const nextOpen = html.slice(bodyStart).search(/<!--\s*pb:section\s+id="/);
    if (close < 0 || (nextOpen >= 0 && bodyStart + nextOpen < close)) {
      throw new CodeError(
        `The section "${m[1]}" has no end marker (${CLOSE}). Put it back or undo your change.`,
        lineAt(html, start),
      );
    }
    outside += html.slice(pos, start) + `\u0000${m[1]}\u0000`;
    regions.push({ id: m[1]!, body: html.slice(bodyStart, close), line: lineAt(html, start) });
    pos = close + CLOSE.length;
    OPEN.lastIndex = pos;
  }
  const rest = html.slice(pos);
  const stray = rest.indexOf(CLOSE);
  if (stray >= 0)
    throw new CodeError('An end marker has no matching start marker.', lineAt(html, pos + stray));
  return { regions, outside: outside + rest };
}

const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

export interface CodeEditResult {
  ops: Operation[];
  /** Sections that become custom with this save (shown with an Undo). */
  converted: string[];
}

/**
 * Compares edited index.html with the generated one and returns the operations that
 * keep the edits: changed sections become (or stay) custom sections.
 * Throws CodeError when markers are broken or text outside sections changed.
 */
export function codeEditOps(generated: string, edited: string, state: SiteState): CodeEditResult {
  const before = parseSections(generated);
  const after = parseSections(edited);
  const ids = (p: Parsed) => p.regions.map((r) => r.id).join(',');
  if (ids(before) !== ids(after)) {
    const missing = before.regions.find((r) => !after.regions.some((a) => a.id === r.id));
    const line = missing
      ? 1
      : (after.regions.find((r, i) => before.regions[i]?.id !== r.id)?.line ?? 1);
    throw new CodeError(
      missing
        ? `The section "${missing.id}" (or its markers) was removed. Hide or remove sections in the Sections panel instead.`
        : 'Sections were added, renamed or reordered here. Use the Sections panel for that.',
      line,
    );
  }
  if (norm(before.outside) !== norm(after.outside)) {
    const a = before.outside.split('\n');
    const b = after.outside.split('\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i]!.trim() === b[i]!.trim()) i++;
    throw new CodeError(
      'Only the code inside sections can be edited here. Change the header, footer and page settings in the panels, or style them with custom.css.',
      Math.max(1, Math.min(i + 1, edited.split('\n').length)),
    );
  }
  const ops: Operation[] = [];
  const converted: string[] = [];
  after.regions.forEach((r, i) => {
    if (norm(r.body) === norm(before.regions[i]!.body)) return;
    const spec = state.spec.sections.find((s) => s.id === r.id);
    if (!spec) return;
    const existing = state.custom.sections[r.id];
    ops.push({
      op: 'convertToCustom',
      id: r.id,
      html: norm(r.body),
      css: existing?.css ?? '',
      js: existing?.js ?? '',
    });
    if (!spec.custom) converted.push(r.id);
  });
  return { ops, converted };
}
