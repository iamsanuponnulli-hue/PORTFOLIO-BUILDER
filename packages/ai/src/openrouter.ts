/**
 * "Sign in with OpenRouter" (OAuth PKCE): the user approves on openrouter.ai and the
 * app receives a key for their account — no copy and paste.
 * https://openrouter.ai/docs/use-cases/oauth-pkce
 */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge: b64url(digest) };
}

export function openRouterAuthUrl(callbackUrl: string, challenge: string): string {
  const q = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://openrouter.ai/auth?${q}`;
}

/** Exchanges the code from the callback for a user-controlled API key. */
export async function exchangeOpenRouterCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!res.ok) throw new Error(`OpenRouter sign-in failed (${res.status}). Try again.`);
  const j = (await res.json()) as { key?: string };
  if (!j.key) throw new Error('OpenRouter sign-in did not return a key. Try again.');
  return j.key;
}
