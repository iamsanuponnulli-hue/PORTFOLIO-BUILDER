import { MockLanguageModelV4 } from 'ai/test';

/** A fake model that answers with the given texts in order (or an error). */
export function fakeModel(replies: (string | Error)[]) {
  let i = 0;
  return new MockLanguageModelV4({
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async () => {
      const r = replies[Math.min(i++, replies.length - 1)]!;
      if (r instanceof Error) throw r;
      return {
        content: [{ type: 'text', text: r }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}
