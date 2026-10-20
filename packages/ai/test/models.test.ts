import { describe, expect, it } from 'vitest';
import {
  capabilitiesFor,
  modelStatus,
  createPkce,
  exchangeOpenRouterCode,
  listModels,
  openRouterAuthUrl,
  suggestModel,
} from '../src/index.ts';

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new TypeError('Failed to fetch');
    const r = routes[key]!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('listing models (also how keys are checked)', () => {
  it('lists Gemini text models and sends the key in a header, not the URL', async () => {
    const { f, calls } = fakeFetch({
      'https://generativelanguage.googleapis.com/v1beta/models': {
        body: {
          models: [
            {
              name: 'models/gemini-2.5-flash',
              displayName: 'Gemini 2.5 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
            { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          ],
        },
      },
    });
    const models = await listModels({ provider: 'gemini', apiKey: 'k' }, f);
    expect(models.map((m) => m.id)).toEqual(['gemini-2.5-flash']);
    expect(models[0]!.free).toBe(true);
    expect(models[0]!.capabilities.images).toBe(true);
    expect(calls[0]!.url).not.toContain('k');
  });

  it('marks free OpenRouter models and checks the key first', async () => {
    const { f, calls } = fakeFetch({
      'https://openrouter.ai/api/v1/key': { body: { data: {} } },
      'https://openrouter.ai/api/v1/models': {
        body: {
          data: [
            { id: 'meta-llama/llama-3.3-70b-instruct:free' },
            { id: 'openai/gpt-4o', pricing: { prompt: '0.000005', completion: '0.00001' } },
          ],
        },
      },
    });
    const models = await listModels({ provider: 'openrouter', apiKey: 'k' }, f);
    expect(models.find((m) => m.id.endsWith(':free'))!.free).toBe(true);
    expect(models.find((m) => m.id === 'openai/gpt-4o')!.free).toBe(false);
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/key');
  });

  it('reports a rejected key', async () => {
    const { f } = fakeFetch({ 'https://api.groq.com/openai/v1/models': { status: 401, body: {} } });
    await expect(listModels({ provider: 'groq', apiKey: 'bad' }, f)).rejects.toMatchObject({
      code: 'invalid_key',
    });
  });

  it('reports providers that block web pages as a network problem', async () => {
    const { f } = fakeFetch({});
    await expect(listModels({ provider: 'openai', apiKey: 'k' }, f)).rejects.toMatchObject({
      code: 'network',
    });
  });
});

describe('model suggestions and capabilities', () => {
  it('suggests a capable free model', () => {
    const m = (id: string, free = true) => ({
      id,
      label: id,
      free,
      capabilities: capabilitiesFor('openrouter', id),
      status: modelStatus('openrouter', id),
    });
    expect(
      suggestModel('openrouter', [
        m('a/tiny-1b:free'),
        m('meta-llama/llama-3.3-70b-instruct:free'),
        m('openai/gpt-4o', false),
      ])!.id,
    ).toBe('meta-llama/llama-3.3-70b-instruct:free');
    const g = (id: string) => ({
      id,
      label: id,
      free: true,
      capabilities: capabilitiesFor('gemini', id),
      status: modelStatus('gemini', id),
    });
    expect(
      suggestModel('gemini', [
        g('gemini-2.0-flash-lite'),
        g('gemini-2.5-flash'),
        g('gemini-2.5-pro'),
      ])!.id,
    ).toBe('gemini-2.5-flash');
  });

  it('labels recommended models', () => {
    expect(modelStatus('gemini', 'gemini-2.5-flash')).toBe('recommended');
    expect(modelStatus('gemini', 'gemini-2.0-flash-lite')).toBe('untested');
    expect(modelStatus('custom', 'anything')).toBe('untested');
  });

  it('treats unknown models as text-only', () => {
    expect(capabilitiesFor('custom', 'my-model')).toEqual({
      images: false,
      pdf: false,
      smart: true,
    });
    expect(capabilitiesFor('anthropic', 'claude-haiku-5-5').smart).toBe(false);
    expect(capabilitiesFor('gemini', 'gemini-2.5-flash').smart).toBe(true);
    expect(capabilitiesFor('openai', 'gpt-4o-mini').smart).toBe(false);
    expect(capabilitiesFor('groq', 'llama-3.1-8b-instant').smart).toBe(false);
    expect(capabilitiesFor('groq', 'llama-3.3-70b-versatile').smart).toBe(true);
  });
});

describe('Sign in with OpenRouter', () => {
  it('builds a PKCE challenge and auth URL', async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const url = new URL(openRouterAuthUrl('https://app.example/settings/ai', challenge));
    expect(url.origin).toBe('https://openrouter.ai');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges the code for a key', async () => {
    const { f, calls } = fakeFetch({
      'https://openrouter.ai/api/v1/auth/keys': { body: { key: 'sk-or-123' } },
    });
    await expect(exchangeOpenRouterCode('code', 'verifier', f)).resolves.toBe('sk-or-123');
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      code: 'code',
      code_verifier: 'verifier',
      code_challenge_method: 'S256',
    });
  });
});
