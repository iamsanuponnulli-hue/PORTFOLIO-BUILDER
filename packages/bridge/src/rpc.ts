/**
 * Tiny request/response protocol over postMessage, used between the page and
 * Web Workers. Heavy packages (images, PDF, ZIP, rendering) register handlers in
 * the worker; the page calls them and gets a Promise back.
 */
export interface Port {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
}

type Request = { id: number; method: string; args: unknown[] };
type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

export type Handlers = Record<string, (...args: never[]) => unknown>;

/** Worker side: answers requests with the registered handlers. */
export function serve(port: Port, handlers: Handlers): void {
  port.addEventListener('message', async (e) => {
    const { id, method, args } = e.data as Request;
    const handler = handlers[method] as ((...a: unknown[]) => unknown) | undefined;
    try {
      if (!handler) throw new Error(`Unknown worker method: ${method}`);
      const value = await handler(...args);
      port.postMessage({ id, ok: true, value } satisfies Response);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      port.postMessage({ id, ok: false, error } satisfies Response);
    }
  });
}

/** Page side: returns a function that calls a worker method and awaits its answer. */
export function client(port: Port, timeoutMs = 60_000) {
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  port.addEventListener('message', (e) => {
    const res = e.data as Response;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.value);
    else p.reject(new Error(res.error));
  });
  return function call<T>(method: string, ...args: unknown[]): Promise<T> {
    const id = next++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Worker method ${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      port.postMessage({ id, method, args } satisfies Request);
    });
  };
}
