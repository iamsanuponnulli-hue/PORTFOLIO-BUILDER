import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openLocalStore } from '../src/index.ts';

let n = 0;
const fresh = () => openLocalStore(`test-${n++}`);

describe('key store', () => {
  it('saves, lists and decrypts keys, showing only the last 4 characters', async () => {
    const s = await fresh();
    const meta = await s.keys.save(
      { provider: 'gemini', apiKey: '  AIzaSyExample1234  ', label: 'Google Gemini' },
      5,
    );
    expect(meta).toEqual({ provider: 'gemini', label: 'Google Gemini', last4: '1234', addedAt: 5 });
    expect(await s.keys.list()).toEqual([meta]);
    expect(await s.keys.get('gemini')).toEqual({ provider: 'gemini', apiKey: 'AIzaSyExample1234' });
  });

  it('never stores the key in readable form', async () => {
    const s = await fresh();
    await s.keys.save({ provider: 'groq', apiKey: 'gsk_secret_value_9999' });
    const raw = await new Promise<unknown[]>((resolve) => {
      const req = indexedDB.open(`test-${n - 1}`);
      req.onsuccess = () => {
        const get = req.result.transaction('keys').objectStore('keys').getAll();
        get.onsuccess = () => resolve(get.result);
      };
    });
    const text = JSON.stringify(raw, (_k, v) =>
      v instanceof ArrayBuffer ? Array.from(new Uint8Array(v)) : v,
    );
    expect(text).not.toContain('gsk_secret_value');
    expect(text).toContain('9999'); // only the last 4, shown in the UI
  });

  it('keeps the base URL for custom providers and removes keys', async () => {
    const s = await fresh();
    await s.keys.save({ provider: 'custom', apiKey: 'abc', baseUrl: 'https://llm.example/v1' });
    expect((await s.keys.get('custom'))!.baseUrl).toBe('https://llm.example/v1');
    await s.keys.remove('custom');
    expect(await s.keys.get('custom')).toBeUndefined();
  });

  it('rejects empty keys', async () => {
    const s = await fresh();
    await expect(s.keys.save({ provider: 'gemini', apiKey: '   ' })).rejects.toThrow('empty');
  });
});

describe('files and drafts', () => {
  it('stores images per project and removes them together', async () => {
    const s = await fresh();
    const blob = new Blob([new Uint8Array(100)], { type: 'image/webp' });
    await s.files.put({
      projectId: 'p1',
      fileId: 'a',
      kind: 'image',
      mediaType: 'image/webp',
      blob,
      variants: { 480: blob },
    });
    await s.files.put({
      projectId: 'p1',
      fileId: 'b',
      kind: 'resume',
      mediaType: 'application/pdf',
      blob,
    });
    await s.files.put({
      projectId: 'p2',
      fileId: 'c',
      kind: 'image',
      mediaType: 'image/webp',
      blob,
    });
    expect((await s.files.list('p1')).map((f) => f.fileId).sort()).toEqual(['a', 'b']);
    expect(await s.files.size('p1')).toBe(300);
    await s.files.setAlt('p1', 'a', 'Portrait');
    expect((await s.files.get('p1', 'a'))!.alt).toBe('Portrait');
    await s.files.removeProject('p1');
    expect(await s.files.list('p1')).toEqual([]);
    expect(await s.files.list('p2')).toHaveLength(1);
  });

  it('keeps unsynced edits as drafts', async () => {
    const s = await fresh();
    await s.drafts.save('p1', 4, { name: 'New name' }, 99);
    expect(await s.drafts.get('p1')).toEqual({
      baseRevision: 4,
      data: { name: 'New name' },
      savedAt: 99,
    });
    await s.drafts.remove('p1');
    expect(await s.drafts.get('p1')).toBeUndefined();
  });

  it('clears everything on sign-out', async () => {
    const s = await fresh();
    await s.keys.save({ provider: 'gemini', apiKey: 'k' });
    await s.drafts.save('p1', 0, {});
    await s.clearAll();
    expect(await s.keys.list()).toEqual([]);
    expect(await s.drafts.get('p1')).toBeUndefined();
  });
});
