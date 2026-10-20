/**
 * Talks to the companion extension through its relay content script (which only
 * runs on the app's own domain). Without the extension, calls fail with
 * code 'no_extension' and the app offers screenshot upload instead.
 */
let installed: string | undefined;

if (typeof window !== 'undefined') {
  installed = document.documentElement.dataset['pbExtension'];
  window.addEventListener('message', (e) => {
    const d = e.data as { pbExt?: string; version?: string } | null;
    if (e.source === window && d?.pbExt === 'hello') installed = d.version;
  });
}

export const extensionVersion = () =>
  installed ?? document.documentElement.dataset['pbExtension'] ?? null;

let next = 1;

export function extensionCall<T>(
  request: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  if (!extensionVersion())
    return Promise.reject(
      Object.assign(
        new Error('The Portfolio Builder extension is not installed in this browser.'),
        {
          code: 'no_extension',
        },
      ),
    );
  const id = `pb-${Date.now()}-${next++}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(
        Object.assign(new Error('The extension took too long to answer.'), { code: 'timeout' }),
      );
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      const d = e.data as {
        pbExt?: string;
        id?: string;
        response?: { ok: boolean; value?: unknown; error?: string };
      } | null;
      if (e.source !== window || d?.pbExt !== 'response' || d.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (d.response?.ok) resolve(d.response.value as T);
      else
        reject(
          Object.assign(new Error(d.response?.error ?? 'The extension failed.'), {
            code: 'extension',
          }),
        );
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ pbExt: 'request', id, request }, location.origin);
  });
}
