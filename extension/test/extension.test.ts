import { describe, expect, it } from 'vitest';
import { originPattern, parseRequest } from '../src/protocol.ts';
import { cssToHex, summarize, type RawSample } from '../src/reader.ts';
import { isAppRequest } from '../src/relay.ts';

describe('requests from the app', () => {
  it('accepts known requests and refuses everything else', () => {
    expect(parseRequest({ type: 'ping' })).toEqual({ type: 'ping' });
    expect(parseRequest({ type: 'capture', url: 'https://example.com' })).toEqual({
      type: 'capture',
      url: 'https://example.com',
    });
    expect(parseRequest({ type: 'capture', url: 'file:///etc/passwd' })).toBeUndefined();
    expect(parseRequest({ type: 'capture', url: 'javascript:alert(1)' })).toBeUndefined();
    expect(parseRequest({ type: 'eval', code: 'x' })).toBeUndefined();
    expect(parseRequest(null)).toBeUndefined();
    const many = Array.from({ length: 80 }, (_, i) => `https://e.com/${i}`);
    expect(
      (parseRequest({ type: 'checkLinks', urls: [...many, 'chrome://x'] }) as { urls: string[] })
        .urls,
    ).toHaveLength(50);
  });

  it('builds per-site permission patterns', () => {
    expect(originPattern('https://a.dev/page?x=1')).toBe('https://a.dev/*');
  });

  it('relays only messages from the app page itself', () => {
    const win = { location: { origin: 'https://app.web.app' } };
    const ok = { source: win, origin: 'https://app.web.app', data: { pbExt: 'request', id: '1' } };
    expect(isAppRequest(ok, win, win)).toBe(true);
    expect(isAppRequest({ ...ok, origin: 'https://evil.dev' }, win, win)).toBe(false);
    expect(isAppRequest({ ...ok, source: {} }, win, win)).toBe(false);
    expect(isAppRequest({ ...ok, data: { pbExt: 'response', id: '1' } }, win, win)).toBe(false);
  });
});

describe('reading a page', () => {
  it('converts CSS colours and skips transparent ones', () => {
    expect(cssToHex('rgb(15, 110, 116)')).toBe('#0f6e74');
    expect(cssToHex('rgba(0, 0, 0, 0)')).toBeUndefined();
    expect(cssToHex('rgb(0 0 0 / 80%)')).toBe('#000000');
    expect(cssToHex('#AbC')).toBe('#aabbcc');
    expect(cssToHex('oklch(70% 0.1 200)')).toBeUndefined();
  });

  it('summarises styles: main colours, fonts and corner radius', () => {
    const raw: RawSample = {
      title: 'Jane',
      url: 'https://jane.dev/',
      text: [
        ['rgb(20, 20, 20)', 500],
        ['rgb(21, 21, 21)', 100],
        ['rgb(100, 100, 100)', 200],
      ],
      backgrounds: [
        ['rgb(255, 255, 255)', 0.9],
        ['rgb(240, 240, 240)', 0.2],
      ],
      accents: [['rgb(200, 40, 60)', 30]],
      fonts: [
        ['"Inter", sans-serif', 700, false],
        ['Fraunces, serif', 90, true],
      ],
      variables: { '--brand': '#c8283c' },
      radius: [8, 8, 8, 12],
      structure: ['nav: 4 links'],
    };
    const s = summarize(raw);
    expect(s.backgrounds).toEqual(['#ffffff', '#f0f0f0']);
    expect(s.colors![0]).toBe('#141414');
    expect(s.colors).toContain('#c8283c');
    expect(s.colors).not.toContain('#151515');
    expect(s.fonts).toEqual([
      { family: 'Inter', uses: 700, heading: false },
      { family: 'Fraunces', uses: 90, heading: true },
    ]);
    expect(s.radius![0]).toBe(8);
  });
});
