import type { Db, KeyRecord } from './db.ts';

/**
 * API keys, encrypted and kept only in this browser. The encryption key is a
 * non-extractable WebCrypto key: page scripts can use it but can't read it out, and
 * the stored data is unreadable on its own (e.g. in a copied browser profile).
 * Keys are never sent to our servers.
 */

export interface StoredKey {
  provider: string;
  label: string;
  last4: string;
  baseUrl?: string;
  addedAt: number;
}

export interface Credentials {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

async function masterKey(db: Db): Promise<CryptoKey> {
  const existing = await db.get('meta', 'master');
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await db.put('meta', key, 'master');
  return key;
}

const meta = (r: KeyRecord): StoredKey => ({
  provider: r.provider,
  label: r.label,
  last4: r.last4,
  addedAt: r.addedAt,
  ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
});

export class KeyStore {
  constructor(private readonly db: Db) {}

  /** Saves (or replaces) the key for a provider. Returns what the UI may show. */
  async save(c: Credentials & { label?: string }, now = Date.now()): Promise<StoredKey> {
    const apiKey = c.apiKey.trim();
    if (!apiKey) throw new Error('The key is empty.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await masterKey(this.db),
      new TextEncoder().encode(apiKey),
    );
    const record: KeyRecord = {
      provider: c.provider,
      label: c.label ?? c.provider,
      last4: apiKey.slice(-4),
      addedAt: now,
      iv,
      ciphertext,
      ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}),
    };
    await this.db.put('keys', record);
    return meta(record);
  }

  async list(): Promise<StoredKey[]> {
    return (await this.db.getAll('keys')).map(meta).sort((a, b) => a.addedAt - b.addedAt);
  }

  /** Decrypts a key for one request. Returns undefined when none is saved. */
  async get(provider: string): Promise<Credentials | undefined> {
    const r = await this.db.get('keys', provider);
    if (!r) return undefined;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: r.iv as Uint8Array<ArrayBuffer> },
      await masterKey(this.db),
      r.ciphertext,
    );
    return {
      provider: r.provider,
      apiKey: new TextDecoder().decode(plain),
      ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
    };
  }

  remove(provider: string): Promise<void> {
    return this.db.delete('keys', provider);
  }
}
