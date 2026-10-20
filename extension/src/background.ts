import {
  originPattern,
  parseRequest,
  VERSION,
  type Capture,
  type LinkResult,
  type Request,
  type Response,
  type Screenshot,
} from './protocol.ts';
import { readPage, summarize } from './reader.ts';

const MAX_PENDING = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until a tab has finished loading (or gives up after `ms`). */
function loaded(tabId: number, ms = 25_000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(), done);
  });
}

/**
 * Site access is asked for per site, the first time. A permission prompt needs a click
 * inside the extension, so a small window explains what's asked and has the button.
 */
async function ensureAccess(url: string, purpose: 'capture' | 'feed'): Promise<void> {
  const origins = [originPattern(url)];
  if (await chrome.permissions.contains({ origins })) return;
  const page = chrome.runtime.getURL(
    `permission.html?${new URLSearchParams({ origin: new URL(url).origin, purpose })}`,
  );
  const win = await chrome.windows.create({
    url: page,
    type: 'popup',
    width: 440,
    height: 340,
    focused: true,
  });
  if (!win) throw new Error("Couldn't open a window.");
  const granted = await new Promise<boolean>((resolve) => {
    const onMsg = (m: unknown) => {
      const r = m as { type?: string; granted?: boolean; origin?: string };
      if (r?.type !== 'permission-result' || r.origin !== new URL(url).origin) return;
      cleanup();
      resolve(!!r.granted);
    };
    const onRemoved = (id: number) => {
      if (id !== win.id) return;
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      chrome.windows.onRemoved.removeListener(onRemoved);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.windows.onRemoved.addListener(onRemoved);
  });
  if (win.id !== undefined) chrome.windows.remove(win.id).catch(() => {});
  if (!granted) throw new Error(`Access to ${new URL(url).host} wasn't allowed.`);
}

async function shoot(windowId: number, kind: Screenshot['kind']): Promise<Screenshot> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 });
  return { kind, dataUrl };
}

const scroll = (tabId: number, y: number) =>
  chrome.scripting.executeScript({
    target: { tabId },
    func: (to: number) => window.scrollTo(0, to),
    args: [y],
  });

/** Opens the site in its own small window, reads its styles, takes screenshots, closes it. */
async function capture(url: string): Promise<Capture> {
  await ensureAccess(url, 'capture');
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 1440,
    height: 900,
    focused: false,
  });
  if (!win) throw new Error("Couldn't open a window.");
  const tabId = win.tabs?.[0]?.id;
  if (win.id === undefined || tabId === undefined) throw new Error("Couldn't open the page.");
  try {
    await loaded(tabId);
    await sleep(1200); // fonts and entrance animations
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
    const styles = summarize(res!.result as ReturnType<typeof readPage>);
    const shots: Screenshot[] = [await shoot(win.id, 'desktop')];
    await scroll(tabId, 900);
    await sleep(600);
    shots.push(await shoot(win.id, 'desktop-scrolled'));
    await chrome.windows.update(win.id, { width: 420, height: 860 });
    await scroll(tabId, 0);
    await sleep(900);
    shots.push(await shoot(win.id, 'mobile'));
    return { url, title: styles.title ?? '', styles, screenshots: shots, capturedAt: Date.now() };
  } finally {
    chrome.windows.remove(win.id).catch(() => {});
  }
}

/** Reads a blog feed (RSS/Atom). Cookies are never sent. */
async function fetchFeed(url: string): Promise<string> {
  await ensureAccess(url, 'feed');
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  if (!res.ok) throw new Error(`The feed answered with an error (${res.status}).`);
  const text = await res.text();
  if (text.length > 3_000_000) throw new Error('The feed is too large.');
  return text;
}

/** Checks external links without site access: reachable or not (status when allowed). */
async function checkLinks(urls: string[]): Promise<LinkResult[]> {
  const one = async (url: string): Promise<LinkResult> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        credentials: 'omit',
        mode: 'no-cors',
        signal: ctl.signal,
      });
      if (res.type === 'opaque') return { url, ok: null };
      return { url, ok: res.ok || res.status === 405, status: res.status };
    } catch {
      return { url, ok: ctl.signal.aborted ? null : false };
    } finally {
      clearTimeout(timer);
    }
  };
  const out: LinkResult[] = [];
  for (let i = 0; i < urls.length; i += 6)
    out.push(...(await Promise.all(urls.slice(i, i + 6).map(one))));
  return out;
}

async function pending(take: boolean): Promise<Capture[]> {
  const { pending = [] } = (await chrome.storage.local.get('pending')) as { pending?: Capture[] };
  if (take) await chrome.storage.local.set({ pending: [] });
  return pending;
}

/** Toolbar button: captures the page the person is looking at for later. */
async function captureActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined || !/^https?:/.test(tab.url ?? '')) return;
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
  const styles = summarize(res!.result as ReturnType<typeof readPage>);
  const shot = await shoot(tab.windowId, 'desktop');
  const list = await pending(false);
  list.unshift({
    url: tab.url!,
    title: styles.title ?? tab.title ?? '',
    styles,
    screenshots: [shot],
    capturedAt: Date.now(),
  });
  await chrome.storage.local.set({ pending: list.slice(0, MAX_PENDING) });
}

async function handle(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'ping':
      return { version: VERSION };
    case 'capture':
      return capture(req.url);
    case 'fetchFeed':
      return fetchFeed(req.url);
    case 'checkLinks':
      return checkLinks(req.urls);
    case 'getPendingCaptures':
      return pending(true);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const m = msg as { channel?: string; request?: unknown; type?: string };
  if (m?.type === 'capture-active-tab' && sender.id === chrome.runtime.id) {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => (tab ? captureActiveTab(tab) : undefined))
      .then(
        () => reply({ ok: true }),
        (e: Error) => reply({ ok: false, error: e.message }),
      );
    return true;
  }
  // Requests from the app arrive through the relay content script on the app's domain.
  if (m?.channel !== 'pb-app' || !sender.tab) return false;
  const req = parseRequest(m.request);
  if (!req) {
    reply({ ok: false, error: 'Unknown request.' } satisfies Response);
    return false;
  }
  handle(req).then(
    (value) => reply({ ok: true, value } satisfies Response),
    (e: Error) => reply({ ok: false, error: e.message || String(e) } satisfies Response),
  );
  return true;
});
