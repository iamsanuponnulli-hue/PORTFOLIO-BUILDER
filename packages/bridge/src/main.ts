// The page bundle stays small: heavy code (AI SDK, PDF reader, renderer) lives in the worker.
import { createPkce, exchangeOpenRouterCode, openRouterAuthUrl } from '@pb/ai/openrouter';
import { PROVIDERS } from '@pb/ai/providers';
import { previewDocument } from '@pb/renderer';
import { LIMITS } from '@pb/schema/limits';
import { openLocalStore, type FileRecord, type LocalStore } from '@pb/localstore';
import { client, type Port } from './rpc.ts';

/**
 * Everything the Flutter app calls lives on window.pb. Dart reaches it through
 * dart:js_interop (see app/lib/core/js/). Calls that can fail resolve to a JSON
 * string `{"ok":true,"value":…}` or `{"ok":false,"error":{"code","message"}}` so Dart
 * never has to catch JavaScript exceptions.
 */

type Result =
  { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } };

async function result(fn: () => Promise<unknown>): Promise<string> {
  try {
    const r: Result = { ok: true, value: await fn() };
    return JSON.stringify(r);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const r: Result = {
      ok: false,
      error: { code: err.code ?? 'error', message: err.message ?? String(e) },
    };
    return JSON.stringify(r);
  }
}

/** Opens the browser's file picker. Resolves to null when the user cancels. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    input.click();
  });
}

const RESUME_TYPES =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

function createBridge(scriptSrc: string) {
  let call: ReturnType<typeof client> | undefined;
  const workerCall = <T>(method: string, ...args: unknown[]) => {
    // The worker is an ES module next to this script, started on first use.
    call ??= client(
      new Worker(new URL('worker/worker.js', scriptSrc), { type: 'module' }) as unknown as Port,
      180_000,
    );
    return call<T>(method, ...args);
  };
  // Each signed-in user gets their own on-device database, so people sharing a
  // browser never see each other's keys or images.
  let user = 'signed-out';
  let store: Promise<LocalStore> | undefined;
  const local = () => (store ??= openLocalStore(`portfolio-builder-${user}`));
  const blobUrls = new Map<string, string[]>();

  const keys = async (provider: string) => {
    const c = await (await local()).keys.get(provider);
    if (!c)
      throw Object.assign(new Error('Add a key for this provider in Settings → AI.'), {
        code: 'no_key',
      });
    return c;
  };

  return {
    version: '0.2.0',
    /** Call after sign-in (and with '' after sign-out). */
    setUser: (uid: string) => {
      const next = uid || 'signed-out';
      if (next !== user) {
        user = next;
        store = undefined;
      }
    },
    limits: LIMITS,
    ping: () => 'pong',

    worker: {
      ping: () => workerCall<string>('ping'),
      normalizeContent: async (json: string) =>
        JSON.stringify(await workerCall('normalizeContent', JSON.parse(json))),
      busyWork: (ms: number) => workerCall<boolean>('busyWork', ms),
      defaultSpec: async (profileType: string, presetId?: string) =>
        JSON.stringify(await workerCall('defaultSpec', profileType, presetId)),
      applyOperations: async (stateJson: string, opsJson: string) =>
        JSON.stringify(
          await workerCall('applyOperations', JSON.parse(stateJson), JSON.parse(opsJson)),
        ),
      render: async (stateJson: string, optionsJson: string) =>
        JSON.stringify(await workerCall('render', JSON.parse(stateJson), JSON.parse(optionsJson))),
    },

    /** Builds the single HTML document shown in the sandboxed preview iframe. */
    previewDocument: (filesJson: string, page?: string) =>
      previewDocument(JSON.parse(filesJson), page),

    /** API keys, stored encrypted on this device only. */
    keys: {
      list: () => result(async () => (await local()).keys.list()),
      /** Checks the key with the provider (by listing models), then saves it. */
      add: (provider: string, apiKey: string, baseUrl: string, label: string) =>
        result(async () => {
          const c = { provider, apiKey: apiKey.trim(), ...(baseUrl ? { baseUrl } : {}) };
          const models = await workerCall<{ models: unknown[]; suggested?: string }>(
            'listModels',
            c,
          );
          const saved = await (await local()).keys.save({ ...c, label });
          return { key: saved, ...models };
        }),
      models: (provider: string) =>
        result(async () => workerCall('listModels', await keys(provider))),
      remove: (provider: string) => result(async () => (await local()).keys.remove(provider)),
    },

    /** "Sign in with OpenRouter": redirect out, then finish on return. */
    openRouter: {
      start: (callbackUrl: string) =>
        result(async () => {
          const { verifier, challenge } = await createPkce();
          sessionStorage.setItem('pb-or-verifier', verifier);
          return openRouterAuthUrl(callbackUrl, challenge);
        }),
      finish: (code: string) =>
        result(async () => {
          const verifier = sessionStorage.getItem('pb-or-verifier');
          if (!verifier) throw new Error('Sign-in expired. Start again.');
          sessionStorage.removeItem('pb-or-verifier');
          const apiKey = await exchangeOpenRouterCode(code, verifier);
          const models = await workerCall<{ models: unknown[]; suggested?: string }>('listModels', {
            provider: 'openrouter',
            apiKey,
          });
          const saved = await (
            await local()
          ).keys.save({ provider: 'openrouter', apiKey, label: 'OpenRouter' });
          return { key: saved, ...models };
        }),
    },

    imports: {
      /** Asks for a resume file, keeps it on this device, and returns its text. */
      pickResume: (projectId: string) =>
        result(async () => {
          const file = await pickFile(RESUME_TYPES);
          if (!file) return null;
          const data = new Uint8Array(await file.arrayBuffer());
          const text = await workerCall<{
            text: string;
            pages: number;
            scanned: boolean;
            kind: string;
          }>('extractResumeText', data, file.name, file.type);
          await (
            await local()
          ).files.put({
            projectId,
            fileId: 'resume',
            kind: 'resume',
            mediaType: file.type || 'application/octet-stream',
            blob: file,
            name: file.name,
          });
          return { ...text, name: file.name };
        }),
      github: (username: string) => result(() => workerCall('importGithub', username)),
    },

    ai: {
      /** Providers with free-tier flags and "get a key" steps (JSON). */
      providers: () => JSON.stringify(PROVIDERS),
      /** Reads resume text with the user's own key and model. Returns PortfolioContent. */
      parseResume: (provider: string, modelId: string, text: string) =>
        result(async () => workerCall('parseResume', await keys(provider), modelId, text)),
    },

    files: {
      /** Asks for an image, resizes it on this device and stores it. */
      pickImage: (projectId: string, fileId: string) =>
        result(async () => {
          const file = await pickFile(IMAGE_TYPES);
          if (!file) return null;
          const img = await workerCall<{
            width: number;
            height: number;
            mediaType: string;
            blob: Blob;
            variants: Record<number, Blob>;
          }>('processImage', file);
          await (
            await local()
          ).files.put({
            projectId,
            fileId,
            kind: 'image',
            mediaType: img.mediaType,
            blob: img.blob,
            variants: img.variants,
            width: img.width,
            height: img.height,
            name: file.name,
          });
          return { fileId, width: img.width, height: img.height };
        }),
      /** Image URLs for the preview (blob: URLs, valid until the next call). */
      previewAssets: (projectId: string) =>
        result(async () => {
          for (const u of blobUrls.get(projectId) ?? []) URL.revokeObjectURL(u);
          const urls: string[] = [];
          const assets: Record<
            string,
            { src: string; width?: number; height?: number; srcset?: string }
          > = {};
          const files = (await (await local()).files.list(projectId)).filter(
            (f: FileRecord) => f.kind === 'image',
          );
          for (const f of files) {
            const src = URL.createObjectURL(f.blob);
            urls.push(src);
            const variants = Object.entries(f.variants ?? {}).map(([w, b]) => {
              const u = URL.createObjectURL(b);
              urls.push(u);
              return `${u} ${w}w`;
            });
            assets[f.fileId] = {
              src,
              width: f.width,
              height: f.height,
              ...(variants.length > 1 ? { srcset: variants.join(', ') } : {}),
            };
          }
          blobUrls.set(projectId, urls);
          return assets;
        }),
      removeProject: (projectId: string) =>
        result(async () => (await local()).files.removeProject(projectId)),
    },

    drafts: {
      save: (projectId: string, baseRevision: number, json: string) =>
        result(async () => (await local()).drafts.save(projectId, baseRevision, JSON.parse(json))),
      get: (projectId: string) => result(async () => (await local()).drafts.get(projectId) ?? null),
      remove: (projectId: string) => result(async () => (await local()).drafts.remove(projectId)),
    },

    /** Deletes everything kept on this device (sign-out, account deletion). */
    clearDevice: () => result(async () => (await local()).clearAll()),
  };
}

// document.currentScript is only set while this file is first executing.
const scriptSrc = (document.currentScript as HTMLScriptElement | null)?.src ?? location.href;
(window as unknown as { pb: ReturnType<typeof createBridge> }).pb = createBridge(scriptSrc);
