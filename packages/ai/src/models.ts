import { AiError } from './errors.ts';
import { providerInfo, type Credentials, type ProviderId } from './providers.ts';

export interface Capabilities {
  /** Accepts images (screenshots, scanned resumes). */
  images: boolean;
  /** Accepts PDF files directly. */
  pdf: boolean;
  /** Good enough for design generation and assistant edits. */
  smart: boolean;
}

export interface ModelInfo {
  id: string;
  label: string;
  /** Costs nothing to call (free tier or a ":free" model). */
  free: boolean;
  capabilities: Capabilities;
}

/**
 * Best-effort capabilities from the model name. Unknown models are treated as
 * text-only, which always works thanks to the fallbacks.
 */
export function capabilitiesFor(provider: ProviderId, id: string): Capabilities {
  const m = id.toLowerCase();
  const vision =
    /gemini|claude|gpt-4o|gpt-4\.1|gpt-5|o3|o4|pixtral|llama-4|llama-3\.2-(11|90)b-vision|qwen.*vl|gemma-3/.test(
      m,
    );
  const pdf = /gemini|claude/.test(m);
  // Whole words only: "gemini" must not count as "mini".
  const size = /\b(\d+(?:\.\d+)?)b\b/.exec(m);
  const small =
    (size ? Number(size[1]) < 20 : false) ||
    /\b(mini|nano|lite|haiku|small|instant|tiny)\b/.test(m);
  return { images: vision, pdf: pdf && provider !== 'openrouter', smart: !small };
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

async function getJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch {
    throw new AiError(
      'network',
      "Couldn't reach the provider. Check your connection (or the provider may not allow web pages to call it).",
    );
  }
  if (res.status === 401 || res.status === 403)
    throw new AiError('invalid_key', 'The provider rejected this key.');
  if (!res.ok) throw new AiError('unknown', `The provider answered with an error (${res.status}).`);
  return res.json();
}

type Row = { id: string; label?: string; free?: boolean };

/**
 * Lists the models this key can use. Calling it is also how a new key is checked:
 * it throws AiError('invalid_key') when the provider rejects the key.
 */
export async function listModels(
  c: Credentials,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelInfo[]> {
  const bearer = { Authorization: `Bearer ${c.apiKey}` };
  let rows: Row[];
  switch (c.provider) {
    case 'gemini': {
      const j = (await getJson(
        `${GEMINI}/models?pageSize=200`,
        { 'x-goog-api-key': c.apiKey },
        fetchImpl,
      )) as {
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      };
      rows = (j.models ?? [])
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            !/embedding|aqa|imagen|tts|image-generation/i.test(m.name),
        )
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName, free: true }));
      break;
    }
    case 'openrouter': {
      // The key check is separate: the model list itself is public.
      await getJson('https://openrouter.ai/api/v1/key', bearer, fetchImpl);
      const j = (await getJson('https://openrouter.ai/api/v1/models', {}, fetchImpl)) as {
        data?: { id: string; name?: string; pricing?: { prompt?: string; completion?: string } }[];
      };
      rows = (j.data ?? []).map((m) => ({
        id: m.id,
        label: m.name,
        free:
          m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
      }));
      break;
    }
    case 'anthropic': {
      const j = (await getJson(
        'https://api.anthropic.com/v1/models?limit=100',
        {
          'x-api-key': c.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        fetchImpl,
      )) as { data?: { id: string; display_name?: string }[] };
      rows = (j.data ?? []).map((m) => ({ id: m.id, label: m.display_name }));
      break;
    }
    default: {
      const base =
        c.provider === 'groq'
          ? 'https://api.groq.com/openai/v1'
          : c.provider === 'openai'
            ? 'https://api.openai.com/v1'
            : c.provider === 'mistral'
              ? 'https://api.mistral.ai/v1'
              : (c.baseUrl ?? '').replace(/\/+$/, '');
      const j = (await getJson(`${base}/models`, bearer, fetchImpl)) as { data?: { id: string }[] };
      rows = (j.data ?? [])
        .filter(
          (m) =>
            !/embed|whisper|tts|dall-e|moderation|guard|audio|transcribe|image|realtime/i.test(
              m.id,
            ),
        )
        .map((m) => ({ id: m.id, free: c.provider === 'groq' }));
    }
  }
  return rows
    .map((r) => ({
      id: r.id,
      label: r.label || r.id,
      free: !!r.free,
      capabilities: capabilitiesFor(c.provider, r.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Picks a sensible default model from a provider's list (free and capable first). */
export function suggestModel(provider: ProviderId, models: ModelInfo[]): ModelInfo | undefined {
  const prefs: Record<ProviderId, RegExp[]> = {
    gemini: [/^gemini-[\d.]+-flash$/, /flash(?!.*(lite|8b|preview|exp))/, /flash/, /gemini/],
    groq: [/gpt-oss-120b/, /llama.*70b/, /llama-4/, /./],
    openrouter: [/:free$/],
    anthropic: [/sonnet/, /haiku/, /opus/],
    openai: [/gpt-5(?!.*(nano|mini))/, /gpt-4\.1(?!.*(nano|mini))/, /gpt-4o(?!-mini)/, /gpt/],
    mistral: [/mistral-large/, /mistral-medium/, /mistral/],
    custom: [/./],
  };
  const pool = provider === 'openrouter' ? models.filter((m) => m.free) : models;
  for (const re of prefs[provider]) {
    const hits = pool.filter((m) => re.test(m.id) && m.capabilities.smart);
    if (hits.length) return hits.sort((a, b) => b.id.localeCompare(a.id))[0];
  }
  return pool[0];
}

export { providerInfo };
