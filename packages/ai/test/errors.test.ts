import { APICallError, RetryError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  geminiThinkingBudget,
  listModels,
  reasoningFor,
  runJsonTask,
  toAiError,
} from '../src/index.ts';
import { fakeModel } from './helpers.ts';

const http = (statusCode: number, body: unknown, isRetryable = false) =>
  new APICallError({
    message: 'x',
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode,
    responseHeaders: {},
    responseBody: JSON.stringify(body),
    isRetryable,
  });

const code = (e: unknown) => toAiError(e, 'Google Gemini').code;

describe('provider errors', () => {
  it('reads what the provider said', () => {
    // Gemini answers 400, not 401, for a bad key.
    expect(
      code(http(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })),
    ).toBe('invalid_key');
    expect(
      code(
        http(429, {
          error: { message: 'Quota exceeded for metric ... limit: 0, model: gemini-2.5-pro' },
        }),
      ),
    ).toBe('model_unavailable');
    expect(
      toAiError(http(429, { error: { message: 'Please retry in 37.2s.' } }), 'X'),
    ).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 38,
    });
    expect(
      toAiError(
        http(404, { error: { message: 'No endpoints found matching your data policy' } }),
        'OpenRouter',
      ).message,
    ).toContain('openrouter.ai/settings/privacy');
    expect(
      code(http(400, { error: { message: "This model's maximum context length is 8192 tokens" } })),
    ).toBe('too_long');
    expect(
      toAiError(http(400, { error: { message: 'Unsupported value: temperature' } }), 'X').message,
    ).toContain('Unsupported value: temperature');
  });

  it('unwraps the error the AI SDK throws after its retries', () => {
    const wrapped = new RetryError({
      message: 'Failed after 2 attempts',
      reason: 'maxRetriesExceeded',
      errors: [http(429, {}, true), http(429, { error: { message: 'Please retry in 5s.' } }, true)],
    });
    expect(toAiError(wrapped, 'Groq')).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 5,
    });
  });

  it('reports timeouts', () => {
    expect(code(new DOMException('timeout', 'TimeoutError'))).toBe('timeout');
  });

  it('turns a bad Gemini key into invalid_key when listing models', async () => {
    const f = (async () =>
      new Response(JSON.stringify({ error: { message: 'API key not valid.' } }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(listModels({ provider: 'gemini', apiKey: 'bad' }, f)).rejects.toMatchObject({
      code: 'invalid_key',
    });
  });
});

describe('cut-off answers', () => {
  it('fails without a pointless repair round', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        return {
          content: [{ type: 'text', text: '{"name":"Ja' }],
          finishReason: { unified: 'length', raw: 'MAX_TOKENS' },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
    await expect(
      runJsonTask({
        model,
        providerLabel: 'X',
        system: '',
        content: 'x',
        schema: z.object({ name: z.string() }),
      }),
    ).rejects.toMatchObject({
      code: 'invalid_output',
      message: expect.stringContaining('cut off'),
    });
    expect(calls).toBe(1);
  });

  it('still repairs a complete but wrong answer', async () => {
    const r = await runJsonTask({
      model: fakeModel(['{}', '{"name":"Jane"}']),
      providerLabel: 'X',
      system: '',
      content: 'x',
      schema: z.object({ name: z.string() }),
    });
    expect(r.repaired).toBe(true);
  });
});

describe('reasoning effort', () => {
  it('asks thinking models to think briefly, and leaves other models alone', () => {
    expect(reasoningFor('gemini', 'gemini-2.5-flash')).toBe('low');
    expect(reasoningFor('gemini', 'gemini-3-pro-preview')).toBe('low');
    expect(reasoningFor('gemini', 'gemini-2.0-flash')).toBeUndefined();
    expect(reasoningFor('groq', 'openai/gpt-oss-120b')).toBe('low');
    expect(reasoningFor('groq', 'llama-3.3-70b-versatile')).toBeUndefined();
    expect(reasoningFor('openai', 'gpt-5-mini')).toBe('low');
    expect(reasoningFor('openai', 'gpt-5-chat-latest')).toBeUndefined();
    expect(reasoningFor('openai', 'gpt-4o')).toBeUndefined();
    expect(reasoningFor('openrouter', 'google/gemini-2.5-flash')).toBeUndefined();
    expect(reasoningFor('anthropic', 'claude-sonnet-4-5')).toBeUndefined();
  });

  it('gives Gemini 2.5 a small thinking budget', () => {
    expect(geminiThinkingBudget('gemini-2.5-flash')).toBe(512);
    expect(geminiThinkingBudget('gemini-2.5-pro')).toBe(1024);
    expect(geminiThinkingBudget('gemini-3-flash-preview')).toBeUndefined();
  });
});
