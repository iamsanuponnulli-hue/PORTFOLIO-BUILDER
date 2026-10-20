import { VERSION } from './protocol.ts';

/**
 * Content script, injected only on the app's own domains (see the manifest). It lets
 * the app page talk to the extension without knowing its id: the page posts
 *   {pbExt:'request', id, request}
 * and gets back {pbExt:'response', id, response}.
 */
export function isAppRequest(
  e: { source: unknown; origin: string; data: unknown },
  win: { location: { origin: string } },
  self: unknown,
): boolean {
  const d = e.data as { pbExt?: unknown; id?: unknown } | null;
  return (
    e.source === self &&
    e.origin === win.location.origin &&
    !!d &&
    d.pbExt === 'request' &&
    typeof d.id === 'string' &&
    d.id.length < 100
  );
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.id) {
  document.documentElement.dataset['pbExtension'] = VERSION;
  window.postMessage({ pbExt: 'hello', version: VERSION }, location.origin);
  window.addEventListener('message', (e) => {
    if (!isAppRequest(e, window, window)) return;
    const { id, request } = e.data as { id: string; request: unknown };
    chrome.runtime
      .sendMessage({ channel: 'pb-app', request })
      .then(
        (response) => response,
        (err: Error) => ({ ok: false, error: err.message }),
      )
      .then((response) => window.postMessage({ pbExt: 'response', id, response }, location.origin));
  });
}
