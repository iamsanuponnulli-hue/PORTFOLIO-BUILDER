import { APICallError } from 'ai';

export type AiErrorCode =
  | 'no_key'
  | 'invalid_key'
  | 'rate_limited'
  | 'no_credit'
  | 'model_unavailable'
  | 'network'
  | 'invalid_output'
  | 'refused'
  | 'unknown';

/** An AI failure with a message a person can act on. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

function retryAfter(headers: Record<string, string> | undefined): number | undefined {
  const v = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined;
}

/** Turns provider and network errors into AiError. */
export function toAiError(err: unknown, providerLabel: string): AiError {
  if (err instanceof AiError) return err;
  if (APICallError.isInstance(err)) {
    const s = err.statusCode ?? 0;
    if (s === 401 || s === 403)
      return new AiError(
        'invalid_key',
        `${providerLabel} rejected the key. Check it in Settings → AI.`,
      );
    if (s === 429) {
      const wait = retryAfter(err.responseHeaders);
      return new AiError(
        'rate_limited',
        `${providerLabel}'s limit was reached${wait ? `. Try again in ${wait} seconds` : '. Try again in a minute'}, or pick another model.`,
        wait,
      );
    }
    if (s === 402)
      return new AiError(
        'no_credit',
        `Your ${providerLabel} account is out of credit. Pick another model or add credit.`,
      );
    if (s === 404)
      return new AiError(
        'model_unavailable',
        `That model isn't available on ${providerLabel} any more. Pick another one.`,
      );
    if (s >= 500)
      return new AiError('unknown', `${providerLabel} had a problem. Try again shortly.`);
    return new AiError('unknown', `${providerLabel} couldn't handle the request (${s}).`);
  }
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
