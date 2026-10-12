import { describe, expect, it, vi } from 'vitest';
import { STARTER } from '@pb/schema';
import { handleRelay, RelayError, type RelayDeps, type Sink } from '../src/relay.ts';

function recordingSink() {
  const out = { status: 0, headers: {} as Record<string, string>, body: '', ended: false };
  const sink: Sink = {
    start: (s, h) => {
      out.status = s;
      out.headers = h;
    },
    write: (c) => {
      out.body += typeof c === 'string' ? c : new TextDecoder().decode(c);
    },
    end: () => {
      out.ended = true;
    },
  };
  return { sink, out };
}

function deps(overrides: Partial<RelayDeps> = {}): RelayDeps {
  return {
    verifyToken: vi.fn(async (t: string) => {
      if (t !== 'good') throw new Error('bad token');
      return 'alice';
    }),
    reserve: vi.fn(async () => {}),
    refund: vi.fn(async () => {}),
    forward: vi.fn(async (_req, sink: Sink) => {
      sink.start(200, { 'content-type': 'text/event-stream' });
      sink.write('data: hi\n\n');
      sink.end();
    }),
    now: () => new Date('2026-10-12T10:00:00Z'),
    ...overrides,
  };
}

const body = {
  kind: 'edit',
  messages: [{ role: 'user', content: 'Make the hero warmer' }],
  maxOutputTokens: 1000,
};
const input = (o: Partial<{ method: string; authorization: string; body: unknown }> = {}) => ({
  method: 'POST',
  authorization: 'Bearer good',
  body,
  ...o,
});

describe('aiRelay', () => {
  it('forwards a valid request and streams the answer', async () => {
    const d = deps();
    const { sink, out } = recordingSink();
    await handleRelay(d, input(), sink);
    expect(out.status).toBe(200);
    expect(out.body).toContain('hi');
    expect(d.reserve).toHaveBeenCalledWith('alice', 'edit', expect.any(Date));
    expect(d.refund).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid sign-in without counting anything', async () => {
    for (const authorization of [undefined, 'Bearer bad']) {
      const d = deps();
      const { sink, out } = recordingSink();
      await handleRelay(d, { method: 'POST', authorization, body }, sink);
      expect(out.status).toBe(401);
      expect(d.reserve).not.toHaveBeenCalled();
    }
  });

  it('rejects malformed bodies and requests over the caps', async () => {
    const cases = [
      { kind: 'edit', messages: [], maxOutputTokens: 10 },
      { ...body, maxOutputTokens: STARTER.maxOutputTokens + 1 },
      { ...body, messages: [{ role: 'user', content: 'x'.repeat(STARTER.maxInputChars + 1) }] },
    ];
    for (const b of cases) {
      const d = deps();
      const { sink, out } = recordingSink();
      await handleRelay(d, input({ body: b }), sink);
      expect(out.status).toBeGreaterThanOrEqual(400);
      expect(d.reserve).not.toHaveBeenCalled();
    }
  });

  it('passes on allowance errors with their status', async () => {
    const d = deps({
      reserve: vi.fn(async () => {
        throw new RelayError(402, 'allowance_used', 'used');
      }),
    });
    const { sink, out } = recordingSink();
    await handleRelay(d, input(), sink);
    expect(out.status).toBe(402);
    expect(JSON.parse(out.body).error.code).toBe('allowance_used');
    expect(d.forward).not.toHaveBeenCalled();
  });

  it('refunds the allowance when the provider fails before answering', async () => {
    const d = deps({
      forward: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const { sink, out } = recordingSink();
    await handleRelay(d, input(), sink);
    expect(out.status).toBe(502);
    expect(d.refund).toHaveBeenCalledWith('alice', 'edit', expect.any(Date));
  });

  it('does not refund once the answer has started streaming', async () => {
    const d = deps({
      forward: vi.fn(async (_r, sink: Sink) => {
        sink.start(200, {});
        sink.write('partial');
        throw new Error('connection lost');
      }),
    });
    const { sink, out } = recordingSink();
    await handleRelay(d, input(), sink);
    expect(out.ended).toBe(true);
    expect(d.refund).not.toHaveBeenCalled();
  });

  it('only accepts POST', async () => {
    const d = deps();
    const { sink, out } = recordingSink();
    await handleRelay(d, input({ method: 'GET' }), sink);
    expect(out.status).toBe(405);
  });
});
