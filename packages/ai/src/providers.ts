import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

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

/** Builds an AI SDK model that calls the provider directly from the browser. */
export function createModel(
  c: Credentials,
  modelId: string,
  fetchImpl?: typeof fetch,
): LanguageModel {
  const f = fetchImpl ? { fetch: fetchImpl } : {};
  switch (c.provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey: c.apiKey, ...f })(modelId);
    case 'groq':
      return createGroq({ apiKey: c.apiKey, ...f })(modelId);
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: c.apiKey,
        ...f,
      })(modelId);
    case 'anthropic':
      // Anthropic requires this header for calls made directly from a web page.
      return createAnthropic({
        apiKey: c.apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        ...f,
      })(modelId);
    case 'openai':
      return createOpenAI({ apiKey: c.apiKey, ...f })(modelId);
    case 'mistral':
      return createMistral({ apiKey: c.apiKey, ...f })(modelId);
    case 'custom':
      if (!c.baseUrl) throw new Error('A base URL is required for this provider.');
      return createOpenAICompatible({
        name: 'custom',
        baseURL: c.baseUrl.replace(/\/+$/, ''),
        apiKey: c.apiKey,
        ...f,
      })(modelId);
  }
}
