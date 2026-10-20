// The page bundle stays small: heavy code (AI SDK, PDF reader, renderer, ZIP) lives in
// the worker, and the code editor loads only when code mode opens.
import { createPkce, exchangeOpenRouterCode, openRouterAuthUrl } from '@pb/ai/openrouter';
import { PROVIDERS } from '@pb/ai/providers';
import { runFullChecks } from '@pb/checks/browser';
import {
  FONTS,
  NAV_VARIANTS,
  PRESETS,
  SECTION_CATALOG,
  previewDocument,
  type SiteFiles,
} from '@pb/renderer';
import { LIMITS } from '@pb/schema/limits';
import { openLocalStore, type FileRecord, type LocalStore } from '@pb/localstore';
import { extensionCall, extensionVersion } from './extension.ts';
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

/** Opens the browser's file picker. Resolves to [] when the user cancels. */
function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (f: File[]) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    input.click();
  });
}
const pickFile = async (accept: string) => (await pickFiles(accept))[0] ?? null;

/** Saves a file to the person's downloads. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const RESUME_TYPES =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';
const BACKUP_TYPES = '.zip,.pbbackup,application/zip';

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head ?? '')?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const randomId = () => Math.random().toString(36).slice(2, 10);

interface ExtCapture {
  url: string;
  title: string;
  styles: Record<string, unknown>;
  screenshots: { kind: string; dataUrl: string }[];
}

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
  const backups = new Map<string, { files: unknown[] }>();
  let axeSource: Promise<string> | undefined;
  let editor: Promise<typeof import('./editor.ts')> | undefined;
  // Set once the code editor module has loaded; its calls are synchronous after that.
  let loadedEditor: typeof import('./editor.ts') | undefined;

  const keys = async (provider: string) => {
    const c = await (await local()).keys.get(provider);
    if (!c)
      throw Object.assign(new Error('Add a key for this provider in Settings → AI.'), {
        code: 'no_key',
      });
    return c;
  };

  /** Runs an AI task in the worker with the user's key, and counts its usage. */
  const ai = async <T extends { usage?: { inputTokens?: number; outputTokens?: number } }>(
    method: string,
    provider: string,
    model: string,
    ...args: unknown[]
  ): Promise<T> => {
    const r = await workerCall<T>(method, await keys(provider), model, ...args);
    await (await local()).usage.record(provider, model, r.usage ?? {}).catch(() => {});
    return r;
  };

  const files = async (projectId: string) => (await local()).files.list(projectId);

  /** Keeps a capture's screenshots on this device; returns the inspiration fields. */
  const saveCapture = async (projectId: string, c: ExtCapture) => {
    const id = `i${randomId()}`;
    const ids: string[] = [];
    for (const s of c.screenshots.slice(0, 3)) {
      const fileId = `insp-${id}-${s.kind}`;
      const blob = dataUrlToBlob(s.dataUrl);
      await (
        await local()
      ).files.put({
        projectId,
        fileId,
        kind: 'inspiration',
        mediaType: blob.type,
        blob,
        name: c.url,
      });
      ids.push(fileId);
    }
    const brief = await workerCall('briefFromStyles', c.styles);
    return {
      id,
      source: 'extension',
      url: c.url,
      title: (c.title || new URL(c.url).host).slice(0, 160),
      brief,
      styles: c.styles,
      screenshots: ids,
    };
  };

  return {
    version: '0.3.0',
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

    /** Design, code mode and score helpers (JSON in, JSON result out). */
    site: {
      /** Section types and layouts, navigation layouts, theme presets and fonts. */
      catalog: () =>
        JSON.stringify({
          sections: SECTION_CATALOG,
          nav: NAV_VARIANTS,
          presets: PRESETS,
          fonts: FONTS.map((f) => ({ family: f.family, category: f.category })),
        }),
      directions: (
        profileType: string,
        goalsJson: string,
        inspirationJson: string,
        round: number,
      ) =>
        result(() =>
          workerCall(
            'curatedDirections',
            profileType,
            JSON.parse(goalsJson),
            JSON.parse(inspirationJson),
            round,
          ),
        ),
      changes: (beforeJson: string, afterJson: string) =>
        result(() => workerCall('describeChanges', JSON.parse(beforeJson), JSON.parse(afterJson))),
      codeEdit: (generated: string, edited: string, stateJson: string) =>
        result(() => workerCall('codeEdit', generated, edited, JSON.parse(stateJson))),
      score: (projectId: string, stateJson: string, fullJson: string) =>
        result(async () => {
          const list = (await files(projectId)).filter((f) => f.kind === 'image');
          const assets = Object.fromEntries(list.map((f) => [f.fileId, { src: f.fileId }]));
          const images = list.map((f) => ({
            fileId: f.fileId,
            bytes: f.blob.size,
            hasVariants: Object.keys(f.variants ?? {}).length > 1,
          }));
          return workerCall(
            'score',
            JSON.parse(stateJson),
            assets,
            fullJson ? JSON.parse(fullJson) : undefined,
            images,
          );
        }),
      fix: (stateJson: string, findingJson: string) =>
        result(() => workerCall('fixOperations', JSON.parse(stateJson), JSON.parse(findingJson))),
    },

    /** Builds the single HTML document shown in the sandboxed preview iframe. */
    previewDocument: (filesJson: string, page?: string, editor?: boolean) =>
      previewDocument(JSON.parse(filesJson), page || 'index.html', { editor: !!editor }),

    /** Full checks: axe-core and layout at three widths, in hidden previews. */
    checks: {
      full: (filesJson: string) =>
        result(async () => {
          axeSource ??= fetch(new URL('axe.min.js', scriptSrc)).then((r) => {
            if (!r.ok) throw new Error("The accessibility checker couldn't be loaded.");
            return r.text();
          });
          return runFullChecks(JSON.parse(filesJson) as SiteFiles, await axeSource);
        }),
    },

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
      /** Blog posts: dev.to directly, other feeds through the extension. */
      feed: (url: string) =>
        result(async () => {
          const trimmed = url.trim();
          const dev = /^(?:https?:\/\/)?(?:www\.)?dev\.to\/(?:feed\/)?@?([a-z0-9_]+)\/?$/i.exec(
            trimmed,
          );
          if (dev) return workerCall('importDevTo', dev[1]);
          const full = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
          const xml = await extensionCall<string>({ type: 'fetchFeed', url: full });
          return workerCall('parseFeed', xml);
        }),
    },

    /** The companion extension (reference-site capture, feeds, link checks). */
    ext: {
      version: () => extensionVersion() ?? '',
      checkLinks: (urlsJson: string) =>
        result(() => extensionCall({ type: 'checkLinks', urls: JSON.parse(urlsJson) }, 180_000)),
    },

    /** Reference sites and screenshots the person likes (kept on this device). */
    inspiration: {
      capture: (projectId: string, url: string) =>
        result(async () => {
          const full = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
          const c = await extensionCall<ExtCapture>({ type: 'capture', url: full });
          return saveCapture(projectId, c);
        }),
      /** Pages sent with the extension's toolbar button while browsing. */
      pending: (projectId: string) =>
        result(async () => {
          if (!extensionVersion()) return [];
          const list = await extensionCall<ExtCapture[]>({ type: 'getPendingCaptures' }, 10_000);
          const out = [];
          for (const c of list) out.push(await saveCapture(projectId, c));
          return out;
        }),
      /** Screenshot upload, for people without the extension. */
      upload: (projectId: string) =>
        result(async () => {
          const picked = (await pickFiles(IMAGE_TYPES, true)).slice(
            0,
            LIMITS.maxInspirationPerProject,
          );
          const out = [];
          for (const file of picked) {
            if (file.size > LIMITS.maxImageBytes) continue;
            const id = `i${randomId()}`;
            const fileId = `insp-${id}-upload`;
            await (
              await local()
            ).files.put({
              projectId,
              fileId,
              kind: 'inspiration',
              mediaType: file.type || 'image/png',
              blob: file,
              name: file.name,
            });
            const palette = await workerCall<string[]>('palette', file).catch(() => []);
            const brief = await workerCall('briefFromStyles', {
              backgrounds: palette.slice(0, 1),
              colors: palette.slice(1),
            });
            out.push({
              id,
              source: 'upload',
              url: '',
              title: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 160),
              brief,
              screenshots: [fileId],
            });
          }
          return out;
        }),
      /** Reads the design with the user's AI (screenshots only for models that see images). */
      analyze: (projectId: string, provider: string, model: string, inspirationJson: string) =>
        result(async () => {
          const insp = JSON.parse(inspirationJson) as {
            screenshots: string[];
            styles?: Record<string, unknown>;
          };
          const shots: Blob[] = [];
          for (const id of insp.screenshots ?? []) {
            const f = await (await local()).files.get(projectId, id);
            if (f) shots.push(f.blob);
          }
          return ai('analyzeInspiration', provider, model, {
            ...(insp.styles ? { styles: insp.styles } : {}),
            screenshots: shots,
          });
        }),
      remove: (projectId: string, fileIdsJson: string) =>
        result(async () => {
          const s = await local();
          for (const id of JSON.parse(fileIdsJson) as string[]) await s.files.remove(projectId, id);
        }),
    },

    ai: {
      /** Providers with free-tier flags and "get a key" steps (JSON). */
      providers: () => JSON.stringify(PROVIDERS),
      /** Reads resume text with the user's own key and model. Returns PortfolioContent. */
      parseResume: (provider: string, modelId: string, text: string) =>
        result(() => ai('parseResume', provider, modelId, text)),
      directions: (provider: string, model: string, inputJson: string) =>
        result(() => ai('designDirections', provider, model, JSON.parse(inputJson))),
      assistant: (provider: string, model: string, inputJson: string) =>
        result(() => ai('assistantEdit', provider, model, JSON.parse(inputJson))),
      customSection: (provider: string, model: string, inputJson: string) =>
        result(() => ai('customSection', provider, model, JSON.parse(inputJson))),
      rewrite: (provider: string, model: string, inputJson: string) =>
        result(() => ai('rewrite', provider, model, JSON.parse(inputJson))),
      taglines: (provider: string, model: string, inputJson: string) =>
        result(() => ai('taglines', provider, model, JSON.parse(inputJson))),
      caseStudy: (provider: string, model: string, inputJson: string) =>
        result(() => ai('caseStudy', provider, model, JSON.parse(inputJson))),
      metaDescription: (provider: string, model: string, stateJson: string) =>
        result(() => ai('metaDescription', provider, model, JSON.parse(stateJson))),
      /** Alt text for images without it, written by a model that can see them. */
      altTexts: (provider: string, model: string, projectId: string, stateJson: string) =>
        result(async () => {
          const state = JSON.parse(stateJson) as {
            content: {
              profile: { name: string; photo?: { assetId: string; alt: string } | null };
              projects: { id: string; title: string; images: { assetId: string; alt: string }[] }[];
            };
          };
          const s = await local();
          const wanted: { assetId: string; path: string; context: string; blob: Blob }[] = [];
          const add = async (assetId: string, path: string, context: string) => {
            const f = await s.files.get(projectId, assetId);
            if (f) wanted.push({ assetId, path, context, blob: f.variants?.[480] ?? f.blob });
          };
          const photo = state.content.profile.photo;
          if (photo && !photo.alt.trim())
            await add(
              photo.assetId,
              'profile.photo.alt',
              `Profile photo of ${state.content.profile.name}`,
            );
          for (const p of state.content.projects)
            for (const [i, im] of p.images.entries())
              if (!im.alt.trim())
                await add(
                  im.assetId,
                  `projects.${p.id}.images.${i}.alt`,
                  `Image for the project "${p.title}"`,
                );
          if (!wanted.length) return { operations: [], usage: {} };
          return ai('altTexts', provider, model, state, wanted);
        }),
    },

    /** AI requests and tokens per month on this device (Settings → AI → Usage). */
    usage: {
      list: () => result(async () => (await local()).usage.list()),
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
          const list = (await files(projectId)).filter(
            (f: FileRecord) => f.kind === 'image' || f.kind === 'inspiration',
          );
          for (const f of list) {
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
      /** Whether a PDF resume is kept for this project (offered in the export). */
      hasResumePdf: (projectId: string) =>
        result(async () => {
          const f = await (await local()).files.get(projectId, 'resume');
          return f?.mediaType === 'application/pdf';
        }),
      removeProject: (projectId: string) =>
        result(async () => (await local()).files.removeProject(projectId)),
    },

    /** The downloadable site, built in the worker. */
    export: {
      zip: (projectId: string, stateJson: string, includeResume: boolean) =>
        result(async () => {
          const r = await workerCall<{
            zip: Blob;
            name: string;
            files: number;
            bytes: number;
            notes: string[];
          }>('buildExport', JSON.parse(stateJson), await files(projectId), !!includeResume);
          download(r.zip, r.name);
          return { name: r.name, files: r.files, bytes: r.bytes, notes: r.notes };
        }),
    },

    /** Project backups: content, design and this device's images in one file. */
    backup: {
      download: (projectId: string, projectJson: string, name: string) =>
        result(async () => {
          const blob = await workerCall<Blob>(
            'createBackup',
            JSON.parse(projectJson),
            await files(projectId),
          );
          const slug =
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'portfolio';
          download(blob, `${slug}-backup.zip`);
          return { bytes: blob.size };
        }),
      /** Asks for a backup file. Returns the project and a token for restoreFiles. */
      pick: () =>
        result(async () => {
          const file = await pickFile(BACKUP_TYPES);
          if (!file) return null;
          const b = await workerCall<{ project: unknown; files: unknown[]; createdAt: number }>(
            'readBackup',
            file,
          );
          const token = randomId();
          backups.set(token, { files: b.files });
          return { token, project: b.project, files: b.files.length, createdAt: b.createdAt };
        }),
      /** Stores the backup's images and resume for a project on this device. */
      restoreFiles: (token: string, projectId: string) =>
        result(async () => {
          const b = backups.get(token);
          if (!b) throw new Error('The backup is no longer open. Choose the file again.');
          const s = await local();
          for (const raw of b.files as {
            fileId: string;
            kind: 'image' | 'resume' | 'inspiration';
            mediaType: string;
            data: Uint8Array<ArrayBuffer>;
            variants?: Record<number, Uint8Array<ArrayBuffer>>;
            width?: number;
            height?: number;
            name?: string;
            alt?: string;
          }[]) {
            const variants: Record<number, Blob> = {};
            for (const [w, d] of Object.entries(raw.variants ?? {}))
              variants[Number(w)] = new Blob([d], { type: 'image/webp' });
            await s.files.put({
              projectId,
              fileId: raw.fileId,
              kind: raw.kind,
              mediaType: raw.mediaType,
              blob: new Blob([raw.data], { type: raw.mediaType }),
              ...(Object.keys(variants).length ? { variants } : {}),
              ...(raw.width ? { width: raw.width } : {}),
              ...(raw.height ? { height: raw.height } : {}),
              ...(raw.name ? { name: raw.name } : {}),
              ...(raw.alt ? { alt: raw.alt } : {}),
            });
          }
          backups.delete(token);
          return b.files.length;
        }),
    },

    /** Code mode's editor (CodeMirror), mounted into an element Flutter created. */
    code: {
      mount: async (
        host: HTMLElement,
        text: string,
        language: string,
        readOnly: boolean,
        dark: boolean,
      ) => {
        editor ??= import(/* webpackIgnore: true */ new URL('editor/editor.js', scriptSrc).href);
        loadedEditor = await editor;
        return loadedEditor.mount(host, text, language as 'html', readOnly, dark);
      },
      getText: (id: number) => loadedEditor?.getText(id) ?? '',
      setText: (id: number, text: string) => loadedEditor?.setText(id, text),
      goToLine: (id: number, line: number) => loadedEditor?.goToLine(id, line),
      destroy: (id: number) => loadedEditor?.destroy(id),
    },

    /** Small per-user settings on this device (dismissed tips, panel choices). */
    prefs: {
      get: (key: string) => {
        try {
          return localStorage.getItem(`pb:${user}:${key}`) ?? '';
        } catch {
          return '';
        }
      },
      set: (key: string, value: string) => {
        try {
          localStorage.setItem(`pb:${user}:${key}`, value);
        } catch {
          // storage unavailable (private mode): the tip just shows again
        }
      },
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
