import { describe, expect, it } from 'vitest';
import {
  createModel,
  listModels,
  runJsonTask,
  suggestModel,
  testModel,
  toAiError,
} from '../src/index.ts';
import { APICallError } from 'ai';
import { z } from 'zod';

const reply = (text: string) =>
  new Response(
    JSON.stringify({
      id: 'x',
      object: 'chat.completion',
      created: 0,
      model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { 'content-type': 'application/json' } },
  );

describe('OpenRouter', () => {
  it('asks models to think briefly and not send their thinking back', async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return reply('{"ok":true}');
    }) as unknown as typeof fetch;
    const model = await createModel(
      { provider: 'openrouter', apiKey: 'k' },
      'google/gemma-4-31b-it:free',
      f,
    );
    await runJsonTask({
      model,
      providerLabel: 'OpenRouter',
      system: '',
      content: 'x',
      schema: z.object({ ok: z.boolean() }),
    });
    expect(bodies[0]).toMatchObject({ reasoning: { effort: 'low', exclude: true } });
  });

  it('suggests a well-known free model and hides music and safety models', async () => {
    const f = (async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/key')
            ? { data: {} }
            : {
                data: [
                  {
                    id: 'xingchen-agi/xing4.0-29b-a4b:free',
                    architecture: { output_modalities: ['text'] },
                  },
                  {
                    id: 'cohere/north-mini-code:free',
                    architecture: { output_modalities: ['text'] },
                  },
                  {
                    id: 'google/gemma-4-31b-it:free',
                    architecture: { output_modalities: ['text'] },
                  },
                  {
                    id: 'google/lyria-3-pro-preview',
                    pricing: { prompt: '0', completion: '0' },
                    architecture: { output_modalities: ['text', 'audio'] },
                  },
                  {
                    id: 'nvidia/nemotron-3.5-content-safety:free',
                    architecture: { output_modalities: ['text'] },
                  },
                ],
              },
        ),
      )) as unknown as typeof fetch;
    const models = await listModels({ provider: 'openrouter', apiKey: 'k' }, f);
    expect(models.map((m) => m.id)).not.toContain('google/lyria-3-pro-preview');
    expect(models.map((m) => m.id)).not.toContain('nvidia/nemotron-3.5-content-safety:free');
    expect(suggestModel('openrouter', models)?.id).toBe('google/gemma-4-31b-it:free');
  });

  it('recognises the daily free limit', () => {
    const e = new APICallError({
      message: 'x',
      url: 'u',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { message: 'Rate limit exceeded: free-models-per-day.' },
      }),
      isRetryable: false,
    });
    expect(toAiError(e, 'OpenRouter').message).toContain("today's free allowance");
  });

  it('gives up on a model that does not answer the test quickly', async () => {
    const f = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
      )) as unknown as typeof fetch;
    const started = Date.now();
    const slow = testModel({ provider: 'openrouter', apiKey: 'k' }, 'slow:free', {
      fetchImpl: f,
      timeoutMs: 50,
    });
    await expect(slow).rejects.toMatchObject({ code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
