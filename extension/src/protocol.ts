/**
 * Messages between the app page and the extension. The page posts requests with
 * window.postMessage; the relay content script (only injected on the app's own
 * domains) forwards them to the extension's service worker and posts the answer back.
 */
export const VERSION = '0.1.0';

export type Request =
  | { type: 'ping' }
  | { type: 'capture'; url: string }
  | { type: 'fetchFeed'; url: string }
  | { type: 'checkLinks'; urls: string[] }
  | { type: 'getPendingCaptures' };

export interface Screenshot {
  kind: 'desktop' | 'desktop-scrolled' | 'mobile';
  /** data:image/jpeg;base64,… */
  dataUrl: string;
}

export interface Capture {
  url: string;
  title: string;
  styles: PageStyles;
  screenshots: Screenshot[];
  capturedAt: number;
}

/** Same shape as @pb/ai's PageStyles (kept here so the extension has no app deps). */
export interface PageStyles {
  url?: string;
  title?: string;
  colors?: string[];
  backgrounds?: string[];
  fonts?: { family: string; uses: number; heading?: boolean }[];
  variables?: Record<string, string>;
  radius?: number[];
  structure?: string[];
}

export interface LinkResult {
  url: string;
  /** false: unreachable; null: couldn't tell (e.g. the site blocks checks). */
  ok: boolean | null;
  status?: number;
}

export type Response = { ok: true; value: unknown } | { ok: false; error: string };

const isHttpUrl = (v: unknown): v is string => {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/** Validates a request from the page; anything unexpected is refused. */
export function parseRequest(raw: unknown): Request | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  switch (r['type']) {
    case 'ping':
    case 'getPendingCaptures':
      return { type: r['type'] };
    case 'capture':
    case 'fetchFeed':
      return isHttpUrl(r['url']) ? { type: r['type'], url: r['url'] } : undefined;
    case 'checkLinks': {
      const urls = r['urls'];
      if (!Array.isArray(urls)) return undefined;
      const ok = urls.filter(isHttpUrl).slice(0, 50);
      return { type: 'checkLinks', urls: ok };
    }
    default:
      return undefined;
  }
}

/** Origin pattern for host permissions, e.g. "https://example.com/*". */
export const originPattern = (url: string) => `${new URL(url).origin}/*`;
