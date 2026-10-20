import type { PortfolioContent } from '@pb/schema';

type WritingItem = PortfolioContent['writing'][number];

export interface FeedPost {
  title: string;
  url: string;
  date: string;
  description: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

/** Plain text from a feed field that may hold escaped HTML. */
const text = (s: string | undefined) =>
  decode(decode(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m?.[1];
}

/** "2026-03-04" from any date a feed uses (RFC 822 or ISO), or ''. */
function isoDate(s: string | undefined): string {
  const d = new Date(text(s));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * Reads an RSS 2.0 or Atom feed with a small, dependency-free parser (it also runs in
 * workers, which have no DOMParser). Returns the newest posts first.
 */
export function parseFeed(xml: string, limit = 10): FeedPost[] {
  const posts: FeedPost[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const it of items) {
    posts.push({
      title: text(tag(it, 'title')),
      url: text(tag(it, 'link')) || text(tag(it, 'guid')),
      date: isoDate(tag(it, 'pubDate') ?? tag(it, 'dc:date')),
      description: text(tag(it, 'description')).slice(0, 300),
    });
  }
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const e of entries) {
    const links = [...e.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]!);
    const alt =
      links.find((a) => /rel=["']alternate["']/i.test(a)) ??
      links.find((a) => !/rel=/i.test(a)) ??
      links[0];
    posts.push({
      title: text(tag(e, 'title')),
      url: decode(/href=["']([^"']+)["']/i.exec(alt ?? '')?.[1] ?? ''),
      date: isoDate(tag(e, 'published') ?? tag(e, 'updated')),
      description: text(tag(e, 'summary') ?? tag(e, 'content')).slice(0, 300),
    });
  }
  return posts
    .filter((p) => p.title && /^https?:\/\//i.test(p.url))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** dev.to's public API allows browser calls; other feeds need the extension. */
export function devToUser(url: string): string | undefined {
  const m = /^(?:https?:\/\/)?(?:www\.)?dev\.to\/(?:feed\/)?@?([a-z0-9_]+)\/?$/i.exec(url.trim());
  return m?.[1];
}

export async function importDevTo(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedPost[]> {
  const res = await fetchImpl(
    `https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=10`,
  );
  if (!res.ok) throw new Error(`dev.to answered with an error (${res.status}).`);
  const rows = (await res.json()) as {
    title?: string;
    url?: string;
    published_at?: string;
    description?: string;
  }[];
  return rows
    .map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      date: (r.published_at ?? '').slice(0, 10),
      description: (r.description ?? '').slice(0, 300),
    }))
    .filter((p) => p.title && p.url);
}

/** Writing-section items for posts, skipping ones already in the portfolio (same URL). */
export function postsToWriting(posts: FeedPost[], existing: WritingItem[] = []): WritingItem[] {
  const have = new Set(existing.map((w) => w.url));
  const ids = new Set(existing.map((w) => w.id));
  const out: WritingItem[] = [];
  let n = existing.length;
  for (const p of posts) {
    if (have.has(p.url)) continue;
    let id = `w${++n}`;
    while (ids.has(id)) id = `w${++n}`;
    ids.add(id);
    out.push({
      id,
      title: p.title.slice(0, 200),
      issuer: '',
      date: p.date,
      url: p.url,
      description: p.description.slice(0, 1000),
    });
  }
  return out;
}
