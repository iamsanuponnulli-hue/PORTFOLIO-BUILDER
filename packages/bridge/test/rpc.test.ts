import { describe, expect, it } from 'vitest';
import { client, serve, type Port } from '../src/rpc.ts';
import { workerHandlers } from '../src/handlers.ts';

type Listener = (e: MessageEvent) => void;

/** Two connected in-memory ports, like a page and its worker. */
function pair(): [Port & { crash(): void }, Port] {
  const listeners: [Listener[], Listener[]] = [[], []];
  const errors: Listener[] = [];
  const make = (me: 0 | 1) => ({
    postMessage: (data: unknown) =>
      queueMicrotask(() => listeners[me === 0 ? 1 : 0].forEach((l) => l({ data } as MessageEvent))),
    addEventListener: (t: string, l: Listener) => (t === 'error' ? errors : listeners[me]).push(l),
    crash: () => errors.forEach((l) => l({ message: 'boom' } as unknown as MessageEvent)),
  });
  return [make(0) as Port & { crash(): void }, make(1) as Port];
}

describe('worker rpc', () => {
  it('fails waiting calls at once when the worker crashes', async () => {
    const [page] = pair(); // nothing serves: the call would wait for its timeout
    const call = client(page, 60_000);
    const waiting = call('ping');
    page.crash();
    await expect(waiting).rejects.toThrow('boom');
  });

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

  it('renders a site from a default design in the worker', async () => {
    const [page, worker] = pair();
    serve(worker, workerHandlers);
    const call = client(page);
    const spec = await call('defaultSpec', 'student');
    const state = {
      content: await call('normalizeContent', { profile: { name: 'Priya' } }),
      spec,
      custom: { css: '', js: '', sections: {} },
      contactForm: { service: 'none', value: '' },
    };
    const next = await call<typeof state>('applyOperations', state, [
      { op: 'setVariant', id: 'hero', variant: 'bigtype' },
    ]);
    const out = await call<{ files: Record<string, string> }>('render', next, { mode: 'export' });
    expect(out.files['index.html']).toContain('pb-hero--bigtype');
    await expect(call('applyOperations', state, [{ op: 'deleteEverything' }])).rejects.toThrow();
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
