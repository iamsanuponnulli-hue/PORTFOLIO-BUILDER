import { describe, expect, it } from 'vitest';
import { devToUser, parseFeed, postsToWriting } from '../src/index.ts';
import { paletteFromPixels } from '../src/palette.ts';

const RSS = `<?xml version="1.0"?><rss><channel><title>Blog</title>
<item><title><![CDATA[Old &amp; gold]]></title><link>https://blog.dev/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description></item>
<item><title>New post</title><link>https://blog.dev/new</link><pubDate>Tue, 02 Sep 2025 10:00:00 GMT</pubDate></item>
<item><title>No link</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom one</title>
<link rel="self" href="https://x.dev/self"/><link rel="alternate" href="https://x.dev/one"/>
<published>2026-02-03T00:00:00Z</published><summary>Sum</summary></entry></feed>`;

describe('feeds', () => {
  it('reads RSS, newest first, as plain text', () => {
    const posts = parseFeed(RSS);
    expect(posts.map((p) => p.title)).toEqual(['New post', 'Old & gold']);
    expect(posts[1]).toMatchObject({ date: '2024-01-01', description: 'Hello world' });
  });

  it('reads Atom with the alternate link', () => {
    expect(parseFeed(ATOM)[0]).toMatchObject({ url: 'https://x.dev/one', date: '2026-02-03' });
  });

  it('recognises dev.to profiles', () => {
    expect(devToUser('https://dev.to/jane_doe')).toBe('jane_doe');
    expect(devToUser('dev.to/feed/jane')).toBe('jane');
    expect(devToUser('https://medium.com/@jane')).toBeUndefined();
  });

  it('skips posts already in the portfolio', () => {
    const out = postsToWriting(parseFeed(RSS), [
      { id: 'w1', title: 'x', issuer: '', date: '', url: 'https://blog.dev/old', description: '' },
    ]);
    expect(out).toEqual([expect.objectContaining({ id: 'w2', url: 'https://blog.dev/new' })]);
  });
});

describe('palette', () => {
  it('finds the main colours, most used first', () => {
    const px = new Uint8ClampedArray(4 * 100);
    for (let i = 0; i < 100; i++) {
      const c = i < 70 ? [250, 250, 250] : i < 95 ? [200, 30, 60] : [10, 10, 10];
      px.set([...c, 255], i * 4);
    }
    expect(paletteFromPixels(px, 3)).toEqual(['#fafafa', '#c81e3c', '#0a0a0a']);
  });
});
