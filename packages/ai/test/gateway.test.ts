import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiError, extractJson, runJsonTask } from '../src/index.ts';
import { fakeModel } from './helpers.ts';

const schema = z.object({ name: z.string(), tags: z.array(z.string()) });
const task = (replies: (string | Error)[]) => ({
  model: fakeModel(replies),
  providerLabel: 'Fake AI',
  system: 'Return JSON.',
  content: 'hello',
  schema,
});

describe('extractJson', () => {
  it('reads plain JSON, fenced JSON and JSON surrounded by chatter', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here you go:\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Sure! {"a":"x}y","b":{"c":1}} Hope that helps')).toEqual({
      a: 'x}y',
      b: { c: 1 },
    });
  });
  it('rejects replies without complete JSON', () => {
    expect(() => extractJson('no json here')).toThrow();
    expect(() => extractJson('{"a": [1, 2')).toThrow(/cut off/);
  });
});

describe('runJsonTask', () => {
  it('returns validated JSON from the first answer', async () => {
    const r = await runJsonTask(task(['{"name":"Jane","tags":["a"]}']));
    expect(r.value).toEqual({ name: 'Jane', tags: ['a'] });
    expect(r.repaired).toBe(false);
    expect(r.usage.inputTokens).toBe(10);
  });

  it('gives the model one chance to fix invalid output', async () => {
    const model = fakeModel(['{"name":"Jane"}', '{"name":"Jane","tags":[]}']);
    const r = await runJsonTask({ ...task([]), model });
    expect(r.repaired).toBe(true);
    expect(r.value.tags).toEqual([]);
    // The repair message tells the model what was wrong.
    const second = model.doGenerateCalls[1]!.prompt.at(-1);
    expect(JSON.stringify(second)).toContain('tags');
  });

  it('fails clearly when the repair also fails', async () => {
    await expect(runJsonTask(task(['nope', 'still nope']))).rejects.toMatchObject({
      code: 'invalid_output',
    });
  });

  it('maps provider errors to actionable messages', async () => {
    const http = (statusCode: number, headers: Record<string, string> = {}) =>
      new APICallError({
        message: 'x',
        url: 'https://example.test',
        requestBodyValues: {},
        statusCode,
        responseHeaders: headers,
        isRetryable: false,
      });
    await expect(runJsonTask(task([http(401)]))).rejects.toMatchObject({ code: 'invalid_key' });
    await expect(runJsonTask(task([http(429, { 'retry-after': '20' })]))).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 20,
    });
    await expect(runJsonTask(task([http(402)]))).rejects.toMatchObject({ code: 'no_credit' });
    await expect(runJsonTask(task([new TypeError('Failed to fetch')]))).rejects.toMatchObject({
      code: 'network',
    });
    await expect(runJsonTask(task([http(401)]))).rejects.toBeInstanceOf(AiError);
  });
});
