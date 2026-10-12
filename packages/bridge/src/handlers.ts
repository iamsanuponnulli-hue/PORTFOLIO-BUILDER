import {
  createModel,
  listModels,
  parseResume,
  providerInfo,
  suggestModel,
  type Credentials,
  type ProviderId,
} from '@pb/ai';
import { extractResumeText, importGithub, processImage, usePdfWorker } from '@pb/imports';
import { applyAll, defaultSpec, render, type RenderOptions, type SiteState } from '@pb/renderer';
import { Operation, PortfolioContent, ProfileType } from '@pb/schema';

// pdf.js runs its own worker; point it at the copy next to the app's scripts.
usePdfWorker(new URL('../pdf.worker.min.mjs', import.meta.url).href);

/**
 * Methods that run inside the background worker: anything heavy or that calls
 * another service (AI providers, GitHub). Inputs are validated here.
 */
export const workerHandlers = {
  ping: () => 'pong',
  normalizeContent: (raw: unknown) => PortfolioContent.parse(raw ?? {}),
  busyWork: (ms: number) => {
    const end = Date.now() + Math.min(ms, 5000);
    let n = 0;
    while (Date.now() < end) n++;
    return n > 0;
  },

  // Design and rendering
  defaultSpec: (profileType: string, presetId?: string) =>
    defaultSpec(ProfileType.parse(profileType), presetId),
  applyOperations: (state: SiteState, ops: unknown[]) =>
    applyAll(
      state,
      ops.map((o) => Operation.parse(o)),
    ),
  render: (state: SiteState, options: RenderOptions) => render(state, options),

  // Imports
  extractResumeText: (data: Uint8Array, name: string, mediaType: string) =>
    extractResumeText(data, name, mediaType),
  importGithub: (username: string) => importGithub(username),
  processImage: (file: Blob) => processImage(file),

  // AI, with the user's own key
  listModels: async (c: Credentials) => {
    const models = await listModels(c);
    return { models, suggested: suggestModel(c.provider, models)?.id };
  },
  parseResume: async (c: Credentials, modelId: string, text: string) => {
    const model = await createModel(c, modelId);
    const r = await parseResume(model, providerInfo(c.provider as ProviderId).label, { text });
    return { content: r.value, truncated: r.truncated, usage: r.usage };
  },
};
export type WorkerHandlers = typeof workerHandlers;
