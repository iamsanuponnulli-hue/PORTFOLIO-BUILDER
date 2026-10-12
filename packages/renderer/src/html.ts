/** Small, dependency-free helpers for building safe HTML strings. */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in element content or a double-quoted attribute. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]!);
}

/**
 * Only allows link targets that can't run script: http(s), mailto, tel, in-page
 * anchors and relative paths. Anything else becomes "#".
 */
export function safeUrl(url: string | undefined | null): string {
  const u = (url ?? '').trim();
  if (!u) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[#/.]|^[a-z0-9_-]+(\.html)?([#?].*)?$/i.test(u) && !/^[a-z][a-z0-9+.-]*:/i.test(u))
    return u;
  // Bare domains like "github.com/jane" are common in resumes.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(u)) return `https://${u}`;
  return '#';
}

/** True for links that leave the site (opened in a new tab with rel="noopener"). */
export const isExternal = (url: string) => /^https?:/i.test(url);

export function linkAttrs(url: string): string {
  const href = safeUrl(url);
  return isExternal(href)
    ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"`
    : `href="${esc(href)}"`;
}

/** Joins class names, skipping empty ones. */
export const cls = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/** Plain text with blank-line paragraphs → <p> elements. Never passes HTML through. */
export function paragraphs(text: string, attrs = ''): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${attrs}>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function slugify(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'item';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}
