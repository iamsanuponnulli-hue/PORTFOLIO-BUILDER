import { APICallError, RetryError } from 'ai';

export type AiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'no_credit'
  | 'model_unavailable'
  | 'too_long'
  | 'timeout'
  | 'network'
  | 'invalid_output'
  | 'refused'
  | 'unknown';

/** An AI failure with a message a person can act on. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: AiErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryAfter(headers: Record<string, string> | undefined, text: string): number | undefined {
  const v = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const n = v ? Number(v) : NaN;
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  // Gemini puts it in the body: "Please retry in 37.2s" / "retryDelay": "37s".
  const m = /retry in (\d+(?:\.\d+)?)s|"retryDelay":\s*"(\d+)s"/i.exec(text);
  return m ? Math.ceil(Number(m[1] ?? m[2])) : undefined;
}

/** The provider's own explanation, from its JSON error body (shortened). */
export function providerMessage(body: string | undefined, data?: unknown): string {
  const pick = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (!v || typeof v !== 'object') return undefined;
    const o = v as Record<string, unknown>;
    return pick(o['error']) ?? (typeof o['message'] === 'string' ? o['message'] : undefined);
  };
  let text = pick(data);
  if (!text && body) {
    try {
      text = pick(JSON.parse(body));
    } catch {
      text = body;
    }
  }
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

const KEY_PROBLEM =
  /api[ _-]?key|invalid.*key|key.*(invalid|expired|revoked)|unauthori[sz]ed|authenticat/i;
const TOO_LONG = /context|too long|too large|maximum.*tokens|token limit|reduce the length/i;

/**
 * Turns an HTTP error from a provider into AiError. Used for both AI calls and
 * the model list, so a bad key reads the same everywhere.
 */
export function httpError(
  status: number,
  providerLabel: string,
  body: string,
  headers?: Record<string, string>,
): AiError {
  const detail = providerMessage(body);
  const said = detail ? ` ${providerLabel} said: "${detail}"` : '';
  // Gemini answers 400 (not 401) for a bad key.
  if (status === 401 || status === 403 || (status === 400 && KEY_PROBLEM.test(detail)))
    return new AiError(
      'invalid_key',
      `${providerLabel} rejected the key. Make sure you copied all of it, or create a new one.`,
    );
  if (status === 429) {
    // A quota of 0 means the model isn't part of the free tier at all; waiting won't help.
    if (/limit:\s*0\b|free[_ ]tier.*\b0\b/i.test(body))
      return new AiError(
        'model_unavailable',
        `This model isn't included in ${providerLabel}'s free tier. Pick another model (a "Flash" model usually is).`,
      );
    if (/per[ _]?day|daily/i.test(body))
      return new AiError(
        'rate_limited',
        `You've used today's free allowance for this model on ${providerLabel}. Try again tomorrow, or pick another model.`,
      );
    const wait = retryAfter(headers, body);
    return new AiError(
      'rate_limited',
      `${providerLabel} is limiting requests right now${wait ? `. Try again in ${wait} seconds` : '. Try again in a minute'}, or pick another model.`,
      wait,
    );
  }
  if (status === 402)
    return new AiError(
      'no_credit',
      `Your ${providerLabel} account is out of credit. Pick a free model or add credit.`,
    );
  if (status === 404 && /data policy|privacy/i.test(detail))
    return new AiError(
      'model_unavailable',
      'OpenRouter blocks this free model with your current privacy settings. Allow free models at openrouter.ai/settings/privacy, or pick another model.',
    );
  if (status === 404)
    return new AiError(
      'model_unavailable',
      `That model isn't available on ${providerLabel} any more. Pick another one.`,
    );
  if (status === 413 || ((status === 400 || status === 422) && TOO_LONG.test(detail)))
    return new AiError(
      'too_long',
      'That was too much text for this model. Pick a model that takes longer input, or shorten the text.',
    );
  if (status === 529 || status === 503)
    return new AiError(
      'rate_limited',
      `${providerLabel} is overloaded right now. Try again shortly.`,
    );
  if (status >= 500)
    return new AiError('unknown', `${providerLabel} had a problem. Try again shortly.`);
  return new AiError('unknown', `${providerLabel} couldn't handle the request (${status}).${said}`);
}

/** Turns provider and network errors into AiError. */
export function toAiError(err: unknown, providerLabel: string): AiError {
  if (err instanceof AiError) return err;
  // After its retries, the AI SDK wraps the last failure.
  if (RetryError.isInstance(err)) return toAiError(err.lastError, providerLabel);
  if (APICallError.isInstance(err)) {
    const body = err.responseBody ?? (err.data ? JSON.stringify(err.data) : '');
    return httpError(err.statusCode ?? 0, providerLabel, body, err.responseHeaders);
  }
  const name = (err as { name?: string } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError')
    return new AiError(
      'timeout',
      `${providerLabel} took too long to answer. Try again, or pick a faster model.`,
    );
  if (err instanceof TypeError) {
    return new AiError(
      'network',
      `Couldn't reach ${providerLabel}. Check your connection and try again.`,
    );
  }
  return new AiError(
    'unknown',
    err instanceof Error ? err.message : 'Something went wrong with the AI request.',
  );
}
