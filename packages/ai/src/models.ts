import { z } from 'zod';
import { AiError, httpError } from './errors.ts';
import { runJsonTask } from './gateway.ts';
import { createModel, providerInfo, type Credentials, type ProviderId } from './providers.ts';

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
  /** recommended: known to work well for this app's tasks; untested: may still work. */
  status: ModelStatus;
}

export type ModelStatus = 'recommended' | 'untested';

/**
 * Models we recommend (config, not code). A model joins this list once it passes the
 * cross-model evals in evals/ for every task; others are offered as "untested".
 */
const RECOMMENDED: Partial<Record<ProviderId, RegExp[]>> = {
  gemini: [/^gemini-(2\.5|[3-9][\d.]*)-(flash|pro)$/],
  groq: [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4-maverick/],
  openrouter: [
    /gemini.*flash/,
    /gpt-oss-120b/,
    /llama-3\.3-70b/,
    /deepseek-chat/,
    /claude/,
    /gpt-5/,
  ],
  anthropic: [/sonnet/, /haiku/, /opus/],
  openai: [/^gpt-5/, /^gpt-4\.1/, /^gpt-4o/],
  mistral: [/mistral-large/, /mistral-medium/],
};

export function modelStatus(provider: ProviderId, id: string): ModelStatus {
  const m = id.toLowerCase();
  return (RECOMMENDED[provider] ?? []).some((re) => re.test(m)) ? 'recommended' : 'untested';
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
  providerLabel: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    if ((e as { name?: string }).name === 'TimeoutError')
      throw new AiError('timeout', `${providerLabel} took too long to answer. Try again.`);
    throw new AiError(
      'network',
      `Couldn't reach ${providerLabel}. Check your connection, or the service may not allow web pages to call it.`,
    );
  }
  if (!res.ok) throw httpError(res.status, providerLabel, await res.text().catch(() => ''));
  return res.json();
}

/** Model families that can't answer a text request (or are retired), hidden from the list. */
const NOT_FOR_TEXT =
  /embed|aqa|imagen|veo|tts|audio|live|image|vision-only|computer-use|robotics|learnlm|whisper|dall-e|moderation|guard|safety|lyria|transcribe|realtime|search|^gemini-1\.|^gemini-pro$|^gemini-2\.0-.*(exp|thinking)/i;

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
  const label = providerInfo(c.provider).label;
  let rows: Row[];
  switch (c.provider) {
    case 'gemini': {
      const j = (await getJson(
        `${GEMINI}/models?pageSize=200`,
        { 'x-goog-api-key': c.apiKey },
        fetchImpl,
        label,
      )) as {
        models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      };
      rows = (j.models ?? [])
        .map((m) => ({ ...m, id: m.name.replace(/^models\//, '') }))
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes('generateContent') && !NOT_FOR_TEXT.test(m.id),
        )
        .map((m) => ({ id: m.id, label: m.displayName, free: true }));
      break;
    }
    case 'openrouter': {
      // The key check is separate: the model list itself is public.
      await getJson('https://openrouter.ai/api/v1/key', bearer, fetchImpl, label);
      const j = (await getJson('https://openrouter.ai/api/v1/models', {}, fetchImpl, label)) as {
        data?: {
          id: string;
          name?: string;
          pricing?: { prompt?: string; completion?: string };
          architecture?: { output_modalities?: string[] };
        }[];
      };
      rows = (j.data ?? [])
        .filter(
          (m) =>
            !NOT_FOR_TEXT.test(m.id.split('/').at(-1)!) &&
            // Text only: music and image models also list "text" as an output.
            (m.architecture?.output_modalities ?? ['text']).join() === 'text',
        )
        .map((m) => ({
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
        label,
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
      const j = (await getJson(`${base}/models`, bearer, fetchImpl, label)) as {
        data?: { id: string }[];
      };
      rows = (j.data ?? [])
        .filter((m) => !NOT_FOR_TEXT.test(m.id))
        .map((m) => ({ id: m.id, free: c.provider === 'groq' }));
    }
  }
  return rows
    .map((r) => ({
      id: r.id,
      label: r.label || r.id,
      free: !!r.free,
      capabilities: capabilitiesFor(c.provider, r.id),
      status: modelStatus(c.provider, r.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Picks a sensible default model from a provider's list (free and capable first). */
export function suggestModel(provider: ProviderId, models: ModelInfo[]): ModelInfo | undefined {
  const prefs: Record<ProviderId, RegExp[]> = {
    gemini: [/^gemini-[\d.]+-flash$/, /flash(?!.*(lite|8b|preview|exp))/, /flash/, /gemini/],
    groq: [/gpt-oss-120b/, /llama.*70b/, /llama-4/, /./],
    // The free line-up changes often: prefer well-known general model families,
    // then OpenRouter's own free router, then anything free.
    openrouter: [
      /gemini.*flash/,
      /gpt-oss-120b/,
      /gemma-\d+-(2[6-9]|[3-9]\d)b/,
      /llama.*70b/,
      /deepseek/,
      /qwen/,
      /^openrouter\/free$/,
      /./,
    ],
    anthropic: [/sonnet/, /haiku/, /opus/],
    openai: [/gpt-5(?!.*(nano|mini))/, /gpt-4\.1(?!.*(nano|mini))/, /gpt-4o(?!-mini)/, /gpt/],
    mistral: [/mistral-large/, /mistral-medium/, /mistral/],
    custom: [/./],
  };
  const pool = provider === 'openrouter' ? models.filter((m) => m.free) : models;
  for (const re of prefs[provider]) {
    const hits = pool.filter(
      (m) => re.test(m.id) && m.capabilities.smart && !/code|coder|preview/.test(m.id),
    );
    const rec = hits.filter((m) => m.status === 'recommended');
    if (rec.length) return rec.sort((a, b) => b.id.localeCompare(a.id))[0];
    if (hits.length) return hits.sort((a, b) => b.id.localeCompare(a.id))[0];
  }
  return pool[0];
}

export { providerInfo };

/**
 * Sends one tiny JSON request, so a model that can't be used (not in the free tier,
 * blocked by privacy settings, rejects a setting) fails here and not halfway
 * through a task. Returns how long the answer took.
 */
export const TEST_TIMEOUT_MS = 30_000;

export async function testModel(
  c: Credentials,
  modelId: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ms: number }> {
  const started = Date.now();
  const label = providerInfo(c.provider).label;
  const timeoutMs = opts.timeoutMs ?? TEST_TIMEOUT_MS;
  try {
    await runJsonTask({
      signal: AbortSignal.timeout(timeoutMs),
      model: await createModel(c, modelId, opts.fetchImpl),
      providerLabel: label,
      system: 'You check that a connection works.',
      content: 'Reply with {"ok":true}',
      schema: z.object({ ok: z.boolean() }),
      maxOutputTokens: 1024,
    });
  } catch (e) {
    // A model that can't answer "ok" in 30 seconds is too slow (or down) for this app.
    if ((e as AiError).code === 'timeout')
      throw new AiError(
        'timeout',
        `This model didn't answer within ${Math.round(timeoutMs / 1000)} seconds: it's busy or unavailable on ${label} right now. Pick another one.`,
      );
    throw e;
  }
  return { ms: Date.now() - started };
}
