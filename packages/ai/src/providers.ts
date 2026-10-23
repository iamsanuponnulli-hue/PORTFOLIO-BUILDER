import { wrapLanguageModel, type LanguageModel } from 'ai';

export type ProviderId =
  'gemini' | 'groq' | 'openrouter' | 'anthropic' | 'openai' | 'mistral' | 'custom';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Has a free tier that needs no card. */
  free: boolean;
  /** Where to create a key. */
  keyUrl?: string;
  /** Short steps for the "get a free key" guide. */
  steps: string[];
  /** Shown before the user's resume is sent anywhere. */
  dataNote: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    free: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    steps: [
      'Open Google AI Studio and sign in with a Google account.',
      'Choose "Create API key".',
      'Copy the key and paste it here.',
    ],
    dataNote: "On Gemini's free tier, Google may use what you send to improve its products.",
  },
  {
    id: 'groq',
    label: 'Groq',
    free: true,
    keyUrl: 'https://console.groq.com/keys',
    steps: [
      'Open the Groq console and sign up (no card needed).',
      'Choose "Create API Key".',
      'Copy the key and paste it here.',
    ],
    dataNote: "Check Groq's terms for how free-tier requests are handled.",
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    free: true,
    keyUrl: 'https://openrouter.ai/keys',
    steps: [
      'Choose "Sign in with OpenRouter" — no copying needed.',
      'Models ending in ":free" cost nothing (with daily limits).',
    ],
    dataNote:
      'Some free models on OpenRouter may log or train on requests. The model list marks this where known.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    free: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    steps: ['Create a key in the Anthropic Console (paid account).', 'Paste it here.'],
    dataNote: 'Anthropic does not train on API requests by default.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    free: false,
    keyUrl: 'https://platform.openai.com/api-keys',
    steps: ['Create a key in the OpenAI platform (paid account).', 'Paste it here.'],
    dataNote: 'OpenAI does not train on API requests by default.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    free: false,
    keyUrl: 'https://console.mistral.ai/api-keys',
    steps: ['Create a key in the Mistral console.', 'Paste it here.'],
    dataNote: "Check Mistral's terms for how requests are handled.",
  },
  {
    id: 'custom',
    label: 'Other (OpenAI-compatible)',
    free: false,
    steps: [
      'Paste the base URL (ending in /v1) and a key.',
      'The service must allow requests from web pages (CORS).',
    ],
    dataNote: 'Requests go to the address you entered.',
  },
];

export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

export interface Credentials {
  provider: ProviderId;
  apiKey: string;
  /** Only for 'custom': an OpenAI-compatible base URL. */
  baseUrl?: string;
}

/**
 * How long a "thinking" model may think before answering. This app's tasks are
 * structured edits, not puzzles: low effort answers several times faster with the
 * same quality. Only set where the provider accepts it for this model; other
 * models reject the setting (Groq's Llama, OpenAI's GPT-4o) or don't think anyway.
 */
export function reasoningFor(provider: ProviderId, modelId: string): 'low' | undefined {
  const m = modelId.toLowerCase().split('/').at(-1)!;
  const thinks =
    provider === 'gemini'
      ? /^gemini-(2\.5|[3-9])|^gemini-(flash|pro)(-lite)?-latest$/.test(m)
      : provider === 'groq'
        ? /gpt-oss|qwen3|deepseek-r1/.test(m)
        : provider === 'openai'
          ? /^(o\d|gpt-5)(?!.*chat)/.test(m)
          : false;
  return thinks ? 'low' : undefined;
}

/**
 * Builds an AI SDK model that calls the provider directly from the browser. Each
 * provider's library loads only when it is first used.
 */
export async function createModel(
  c: Credentials,
  modelId: string,
  fetchImpl?: typeof fetch,
): Promise<LanguageModel> {
  const model = await baseModel(c, modelId, fetchImpl);
  const reasoning = reasoningFor(c.provider, modelId);
  if (!reasoning || typeof model === 'string') return model;
  const budget = geminiThinkingBudget(modelId);
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) =>
        budget === undefined
          ? { ...params, reasoning: params.reasoning ?? reasoning }
          : {
              ...params,
              providerOptions: {
                ...params.providerOptions,
                google: {
                  thinkingConfig: { thinkingBudget: budget },
                  ...params.providerOptions?.['google'],
                },
              },
            },
    },
  });
}

/**
 * Gemini 2.5 takes a token budget; the SDK's "low" maps to a tenth of the model's
 * output limit (~6.5k tokens), which is slow and can crowd out the answer.
 */
export function geminiThinkingBudget(modelId: string): number | undefined {
  const m = modelId.toLowerCase().split('/').at(-1)!;
  if (!m.startsWith('gemini-2.5')) return undefined;
  // Pro can't turn thinking off; Flash thinks well enough in a few hundred tokens.
  return m.includes('pro') ? 1024 : 512;
}

async function baseModel(
  c: Credentials,
  modelId: string,
  fetchImpl?: typeof fetch,
): Promise<LanguageModel> {
  const f = fetchImpl ? { fetch: fetchImpl } : {};
  switch (c.provider) {
    case 'gemini': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      return createGoogleGenerativeAI({ apiKey: c.apiKey, ...f })(modelId);
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq');
      return createGroq({ apiKey: c.apiKey, ...f })(modelId);
    }
    case 'openrouter': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: c.apiKey,
        // Lets OpenRouter show which app made the request in the person's activity log.
        headers: { 'X-Title': 'Portfolio Builder' },
        ...f,
      })(modelId);
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      // Anthropic requires this header for calls made directly from a web page.
      return createAnthropic({
        apiKey: c.apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        ...f,
      })(modelId);
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      return createOpenAI({ apiKey: c.apiKey, ...f })(modelId);
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral');
      return createMistral({ apiKey: c.apiKey, ...f })(modelId);
    }
    case 'custom': {
      if (!c.baseUrl) throw new Error('A base URL is required for this provider.');
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
      return createOpenAICompatible({
        name: 'custom',
        baseURL: c.baseUrl.replace(/\/+$/, ''),
        apiKey: c.apiKey,
        ...f,
      })(modelId);
    }
  }
}
