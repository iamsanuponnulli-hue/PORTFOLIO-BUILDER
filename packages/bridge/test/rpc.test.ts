import { describe, expect, it } from 'vitest';
import { client, serve, type Port } from '../src/rpc.ts';
import { workerHandlers } from '../src/handlers.ts';

/** Two connected in-memory ports, like a page and its worker. */
function pair(): [Port, Port] {
  const listeners: [((e: MessageEvent) => void)[], ((e: MessageEvent) => void)[]] = [[], []];
  const make = (me: 0 | 1): Port => ({
    postMessage: (data) =>
      queueMicrotask(() => listeners[me === 0 ? 1 : 0].forEach((l) => l({ data } as MessageEvent))),
    addEventListener: (_t, l) => listeners[me].push(l),
  });
  return [make(0), make(1)];
}

describe('worker rpc', () => {
  it('calls a handler and returns its value', async () => {
    const [page, worker] = pair();
    serve(worker, workerHandlers);
    const call = client(page);
    await expect(call('ping')).resolves.toBe('pong');
  });

  it('applies schema defaults inside the worker', async () => {
    const [page, worker] = pair();
    serve(worker, workerHandlers);
    const call = client(page);
    const c = await call<{ projects: unknown[]; profile: { name: string } }>('normalizeContent', {
      profile: { name: 'Jane' },
    });
    expect(c.profile.name).toBe('Jane');
    expect(c.projects).toEqual([]);
  });

  it('turns handler errors into rejected promises', async () => {
    const [page, worker] = pair();
    serve(worker, workerHandlers);
    const call = client(page);
    await expect(call('normalizeContent', { projects: 'nope' })).rejects.toThrow();
    await expect(call('doesNotExist')).rejects.toThrow(/Unknown worker method/);
  });

  it('times out when the worker never answers', async () => {
    const [page] = pair();
    const call = client(page, 20);
    await expect(call('ping')).rejects.toThrow(/timed out/);
  });
});
