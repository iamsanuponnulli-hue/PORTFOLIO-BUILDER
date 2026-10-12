import { RelayRequest, STARTER } from '@pb/schema';

/** Thrown inside the relay to produce a specific HTTP status and message. */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Kind = RelayRequest['kind'];

/** Writes the provider's answer back to the browser as it arrives. */
export interface Sink {
  start(status: number, headers: Record<string, string>): void;
  write(chunk: Uint8Array | string): void;
  end(): void;
}

export interface RelayDeps {
  /** Returns the uid for a valid Firebase ID token, or throws. */
  verifyToken(token: string): Promise<string>;
  /** Counts one request against the monthly allowance; throws RelayError when used up. */
  reserve(uid: string, kind: Kind, now: Date): Promise<void>;
  /** Gives the allowance back when the provider call fails before anything was sent. */
  refund(uid: string, kind: Kind, now: Date): Promise<void>;
  /** Sends the request to the Starter provider with the platform key and streams the answer. */
  forward(request: RelayRequest, sink: Sink): Promise<void>;
  now(): Date;
}

export function bearerToken(header: string | undefined): string {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!m?.[1])
    throw new RelayError(401, 'unauthenticated', 'Sign in again to use the Starter allowance.');
  return m[1];
}

/** Validates the body against the schema and the Starter abuse caps. */
export function parseRequest(body: unknown): RelayRequest {
  const parsed = RelayRequest.safeParse(body);
  if (!parsed.success) {
    throw new RelayError(400, 'invalid_request', 'The AI request was not in the expected format.');
  }
  const req = parsed.data;
  if (req.maxOutputTokens > STARTER.maxOutputTokens) {
    throw new RelayError(
      400,
      'too_many_tokens',
      `Starter answers are limited to ${STARTER.maxOutputTokens} tokens.`,
    );
  }
  const inputChars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  if (inputChars > STARTER.maxInputChars) {
    throw new RelayError(
      413,
      'input_too_large',
      'This request is too large for the Starter allowance.',
    );
  }
  return req;
}

/**
 * The whole relay: check who is asking, check the request, count it, forward it.
 * Nothing here processes content — it only checks and passes data through.
 */
export async function handleRelay(
  deps: RelayDeps,
  input: { method: string; authorization: string | undefined; body: unknown },
  sink: Sink,
): Promise<void> {
  let reserved: { uid: string; kind: Kind; at: Date } | undefined;
  let started = false;
  const trackedSink: Sink = {
    start: (s, h) => {
      started = true;
      sink.start(s, h);
    },
    write: (c) => sink.write(c),
    end: () => sink.end(),
  };
  try {
    if (input.method !== 'POST') throw new RelayError(405, 'method_not_allowed', 'Use POST.');
    const uid = await deps.verifyToken(bearerToken(input.authorization)).catch((e: unknown) => {
      if (e instanceof RelayError) throw e;
      throw new RelayError(401, 'unauthenticated', 'Sign in again to use the Starter allowance.');
    });
    const request = parseRequest(input.body);
    const at = deps.now();
    await deps.reserve(uid, request.kind, at);
    reserved = { uid, kind: request.kind, at };
    await deps.forward(request, trackedSink);
  } catch (e) {
    if (reserved && !started) await deps.refund(reserved.uid, reserved.kind, reserved.at);
    if (started) {
      // Headers are already sent; the browser sees a cut-off stream and retries.
      sink.end();
      return;
    }
    const err =
      e instanceof RelayError
        ? e
        : new RelayError(
            502,
            'provider_error',
            'The AI provider did not respond. Try again shortly.',
          );
    sink.start(err.status, { 'content-type': 'application/json' });
    sink.write(JSON.stringify({ error: { code: err.code, message: err.message } }));
    sink.end();
  }
}
