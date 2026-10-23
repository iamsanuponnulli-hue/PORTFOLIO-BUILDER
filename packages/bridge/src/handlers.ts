import {
  altText,
  analyzeInspiration,
  assistantEdit,
  capabilitiesFor,
  createModel,
  customSection,
  designDirections,
  listModels,
  metaDescription,
  parseResume,
  providerInfo,
  rewriteItems,
  suggestTaglines,
  suggestModel,
  testModel,
  writeCaseStudy,
  type CaseStudyInput,
  type Credentials,
  type PageStyles,
  type ProviderId,
  type RewriteInput,
  type TaglineInput,
} from '@pb/ai';
import {
  computeScore,
  fixOperations,
  type Finding,
  type FullReport,
  type ImageStat,
} from '@pb/checks';
import {
  buildSite,
  createBackup,
  drawFavicon,
  drawOgImage,
  fetchFonts,
  readBackup,
  zipFiles,
  zipName,
  type Backup,
  type ExportImage,
} from '@pb/export';
import {
  extractResumeText,
  importDevTo,
  importGithub,
  paletteFromImage,
  parseFeed,
  processImage,
  usePdfWorker,
} from '@pb/imports';
import {
  apply,
  applyAll,
  briefFromStyles,
  checkSite,
  codeEditOps,
  CodeError,
  curatedDirections,
  defaultSpec,
  describeChanges,
  fontsUsed,
  render,
  specFromDraft,
  type DesignGoals,
  type Direction,
  type RenderOptions,
  type SiteState,
  type StyleSample,
} from '@pb/renderer';
import { Inspiration, Operation, PortfolioContent, ProfileType } from '@pb/schema';
import { catalogText, contentOutline, contentSummary } from './context.ts';

// pdf.js runs its own worker; point it at the copy next to the app's scripts.
usePdfWorker(new URL('../pdf.worker.min.mjs', import.meta.url).href);

type Usage = { inputTokens?: number; outputTokens?: number };

async function model(c: Credentials, modelId: string) {
  return {
    model: await createModel(c, modelId),
    label: providerInfo(c.provider as ProviderId).label,
    caps: capabilitiesFor(c.provider as ProviderId, modelId),
  };
}

/** Applies operations one by one, keeping the ones that fit (for AI proposals). */
function applyWhatFits(state: SiteState, ops: Operation[]) {
  let next = state;
  const applied: Operation[] = [];
  const failed: { op: Operation; reason: string }[] = [];
  for (const op of ops) {
    try {
      next = apply(next, op);
      applied.push(op);
    } catch (e) {
      failed.push({ op, reason: (e as Error).message });
    }
  }
  return { state: next, applied, failed };
}

/** A file for the export, from what the page read out of the device store. */
export interface StoredFile {
  fileId: string;
  kind: string;
  mediaType: string;
  blob: Blob;
  variants?: Record<number, Blob>;
  width?: number;
  height?: number;
  name?: string;
  alt?: string;
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/**
 * Methods that run inside the background worker: anything heavy or that calls
 * another service (AI providers, GitHub, font downloads). Inputs are validated here.
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
  describeChanges: (before: SiteState, after: SiteState) => describeChanges(before, after),
  briefFromStyles: (styles: StyleSample) => briefFromStyles(styles ?? {}),
  /** Code mode save: edits in index.html become operations (or an error with a line). */
  codeEdit: (generated: string, edited: string, state: SiteState) => {
    try {
      return codeEditOps(generated, edited, state);
    } catch (e) {
      if (e instanceof CodeError) return { error: { message: e.message, line: e.line } };
      throw e;
    }
  },
  /** Three designs without AI (also the fallback when the AI fails). */
  curatedDirections: (
    profileType: string,
    goals: DesignGoals,
    inspiration: unknown[],
    round: number,
  ): Direction[] =>
    curatedDirections(
      ProfileType.parse(profileType),
      goals,
      inspiration.map((i) => Inspiration.parse(i)),
      round,
    ),

  // Score and fixes
  score: (
    state: SiteState,
    assets: RenderOptions['assets'],
    full?: FullReport,
    images?: ImageStat[],
  ) =>
    computeScore(state, checkSite(state, { mode: 'export', assets: assets ?? {} }), full, images),
  fixOperations: (state: SiteState, finding: Finding) => fixOperations(state, finding) ?? null,

  // Imports
  extractResumeText: (data: Uint8Array, name: string, mediaType: string) =>
    extractResumeText(data, name, mediaType),
  importGithub: (username: string) => importGithub(username),
  importDevTo: (username: string) => importDevTo(username),
  parseFeed: (xml: string) => parseFeed(xml),
  processImage: (file: Blob) => processImage(file),
  palette: (file: Blob) => paletteFromImage(file),

  // Export and backups
  buildExport: async (state: SiteState, files: StoredFile[], includeResume: boolean) => {
    const images: ExportImage[] = [];
    for (const f of files.filter((x) => x.kind === 'image')) {
      const variants: Record<number, Uint8Array> = {};
      for (const [w, b] of Object.entries(f.variants ?? {})) variants[Number(w)] = await bytes(b);
      images.push({
        fileId: f.fileId,
        mediaType: f.mediaType,
        data: await bytes(f.blob),
        variants,
        ...(f.width ? { width: f.width } : {}),
        ...(f.height ? { height: f.height } : {}),
      });
    }
    const photo = state.content.profile.photo
      ? files.find((f) => f.fileId === state.content.profile.photo!.assetId)?.blob
      : undefined;
    const resume = files.find((f) => f.kind === 'resume' && f.mediaType === 'application/pdf');
    const [fonts, favicon, ogImage] = await Promise.all([
      fetchFonts(fontsUsed(state.spec.theme)),
      drawFavicon(state, photo).catch(() => undefined),
      drawOgImage(state).catch(() => undefined),
    ]);
    const out = buildSite({
      state,
      images,
      fonts,
      ...(favicon ? { favicon } : {}),
      ...(ogImage ? { ogImage } : {}),
      ...(includeResume && resume
        ? { resume: { name: resume.name ?? 'resume.pdf', data: await bytes(resume.blob) } }
        : {}),
    });
    const zip = zipFiles(out.files);
    return {
      zip: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
      name: zipName(state),
      files: Object.keys(out.files).length,
      bytes: zip.length,
      notes: out.notes,
      checks: out.checks,
    };
  },
  createBackup: async (project: Record<string, unknown>, files: StoredFile[]) => {
    const list = [];
    for (const f of files) {
      const variants: Record<number, Uint8Array> = {};
      for (const [w, b] of Object.entries(f.variants ?? {})) variants[Number(w)] = await bytes(b);
      list.push({
        fileId: f.fileId,
        kind: f.kind,
        mediaType: f.mediaType,
        data: await bytes(f.blob),
        variants,
        ...(f.name ? { name: f.name } : {}),
        ...(f.alt ? { alt: f.alt } : {}),
        ...(f.width ? { width: f.width } : {}),
        ...(f.height ? { height: f.height } : {}),
      });
    }
    const zip = createBackup({ project, files: list, createdAt: Date.now() });
    return new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
  },
  readBackup: async (file: Blob): Promise<Backup> => readBackup(await bytes(file)),

  // AI, with the user's own key
  listModels: async (c: Credentials) => {
    const models = await listModels(c);
    return { models, suggested: suggestModel(c.provider, models)?.id };
  },
  testModel: (c: Credentials, modelId: string) => testModel(c, modelId),
  parseResume: async (c: Credentials, modelId: string, text: string) => {
    const m = await model(c, modelId);
    const r = await parseResume(m.model, m.label, { text });
    return { content: r.value, truncated: r.truncated, usage: r.usage };
  },
  analyzeInspiration: async (
    c: Credentials,
    modelId: string,
    input: { styles?: PageStyles; screenshots?: Blob[] },
  ) => {
    const m = await model(c, modelId);
    const screenshots = [];
    for (const b of input.screenshots ?? [])
      screenshots.push({ data: await bytes(b), mediaType: b.type || 'image/jpeg' });
    const r = await analyzeInspiration(
      m.model,
      m.label,
      { ...(input.styles ? { styles: input.styles } : {}), screenshots },
      m.caps.images,
    );
    return { brief: r.value, usage: r.usage, sawImages: m.caps.images && screenshots.length > 0 };
  },
  designDirections: async (
    c: Credentials,
    modelId: string,
    input: {
      profileType: string;
      goals: Record<string, unknown>;
      state: SiteState;
      inspiration: unknown[];
      avoid?: string[];
    },
  ) => {
    const m = await model(c, modelId);
    const profileType = ProfileType.parse(input.profileType);
    const inspiration = input.inspiration.map((i) => Inspiration.parse(i));
    const r = await designDirections(m.model, m.label, {
      profileType,
      goals: input.goals,
      contentSummary: contentSummary(input.state),
      briefs: inspiration.map((i) => ({ title: i.title, brief: i.brief, borrow: i.borrow })),
      catalog: catalogText(),
      ...(input.avoid ? { avoid: input.avoid } : {}),
    });
    const directions: Direction[] = r.value.map((d, i) => ({
      id: `ai-${Date.now()}-${i}`,
      name: d.name || `Design ${i + 1}`,
      description: d.description,
      spec: specFromDraft(d, profileType),
    }));
    return { directions, usage: r.usage };
  },
  assistantEdit: async (
    c: Credentials,
    modelId: string,
    input: {
      prompt: string;
      state: SiteState;
      selectionId?: string;
      selectionHtml?: string;
      history?: { prompt: string; summary: string }[];
    },
  ) => {
    const m = await model(c, modelId);
    const sel = input.selectionId
      ? input.state.spec.sections.find((s) => s.id === input.selectionId)
      : undefined;
    const r = await assistantEdit(m.model, m.label, {
      prompt: input.prompt,
      spec: input.state.spec,
      content: contentOutline(input.state.content),
      catalog: catalogText(),
      customCss: input.state.custom.css,
      ...(sel
        ? {
            selection: {
              id: sel.id,
              type: sel.type,
              ...(input.selectionHtml ? { html: input.selectionHtml } : {}),
            },
          }
        : {}),
      ...(input.history ? { history: input.history } : {}),
    });
    const result = applyWhatFits(input.state, r.value.operations);
    const contentChanges = result.applied
      .map((o, i) => (['updateContent', 'addItem', 'removeItem'].includes(o.op) ? i : -1))
      .filter((i) => i >= 0);
    return {
      summary: r.value.summary,
      operations: result.applied,
      skipped: [...r.value.rejected.map((x) => x.reason), ...result.failed.map((f) => f.reason)],
      contentChanges,
      changes: describeChanges(input.state, result.state),
      state: result.state,
      usage: r.usage,
    };
  },
  customSection: async (
    c: Credentials,
    modelId: string,
    input: { prompt: string; state: SiteState; sectionId?: string; index?: number },
  ) => {
    const m = await model(c, modelId);
    const current = input.sectionId ? input.state.custom.sections[input.sectionId] : undefined;
    const r = await customSection(m.model, m.label, {
      prompt: input.prompt,
      theme: input.state.spec.theme,
      content: contentOutline(input.state.content, 6000),
      ...(current ? { current } : {}),
    });
    const html = r.value.html.replace(
      /(<section\b[^>]*\bid=")custom(")/,
      `$1${input.sectionId ?? 'custom'}$2`,
    );
    const ops: Operation[] = input.sectionId
      ? [{ op: 'convertToCustom', id: input.sectionId, html, css: r.value.css, js: r.value.js }]
      : [
          {
            op: 'addCustomSection',
            index: input.index ?? input.state.spec.sections.length - 1,
            ...(r.value.title ? { title: r.value.title.slice(0, 80) } : {}),
            html,
            css: r.value.css,
            js: r.value.js,
          },
        ];
    const result = applyWhatFits(input.state, ops);
    return {
      summary: input.sectionId ? 'Rewrote the section code.' : 'Added a custom section.',
      operations: result.applied,
      skipped: result.failed.map((f) => f.reason),
      contentChanges: [],
      changes: describeChanges(input.state, result.state),
      state: result.state,
      usage: r.usage,
    };
  },
  rewrite: async (c: Credentials, modelId: string, input: RewriteInput) => {
    const m = await model(c, modelId);
    const r = await rewriteItems(m.model, m.label, input);
    return { items: r.value, usage: r.usage };
  },
  taglines: async (c: Credentials, modelId: string, input: TaglineInput) => {
    const m = await model(c, modelId);
    const r = await suggestTaglines(m.model, m.label, input);
    return { options: r.value, usage: r.usage };
  },
  caseStudy: async (c: Credentials, modelId: string, input: CaseStudyInput) => {
    const m = await model(c, modelId);
    const r = await writeCaseStudy(m.model, m.label, input);
    return { caseStudy: r.value, usage: r.usage };
  },
  metaDescription: async (c: Credentials, modelId: string, state: SiteState) => {
    const m = await model(c, modelId);
    const p = state.content.profile;
    const r = await metaDescription(m.model, m.label, {
      name: p.name,
      headline: p.headline,
      tagline: p.tagline,
      bio: p.bio.slice(0, 2000),
    });
    return { operations: [{ op: 'setSeo', seo: { description: r.value } }], usage: r.usage };
  },
  /** Alt text for every image that lacks it (vision models only). */
  altTexts: async (
    c: Credentials,
    modelId: string,
    state: SiteState,
    images: { assetId: string; path: string; context: string; blob: Blob }[],
  ) => {
    const m = await model(c, modelId);
    if (!m.caps.images)
      throw Object.assign(
        new Error(
          "This model can't see images. Pick one that can, or write the descriptions yourself.",
        ),
        { code: 'no_vision' },
      );
    const operations: Operation[] = [];
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    for (const im of images.slice(0, 12)) {
      const r = await altText(m.model, m.label, {
        image: await bytes(im.blob),
        mediaType: im.blob.type || 'image/webp',
        context: im.context,
      });
      operations.push({ op: 'updateContent', path: im.path, value: r.value });
      usage.inputTokens! += r.usage.inputTokens ?? 0;
      usage.outputTokens! += r.usage.outputTokens ?? 0;
    }
    return { operations: applyWhatFits(state, operations).applied, usage };
  },
};
export type WorkerHandlers = typeof workerHandlers;
