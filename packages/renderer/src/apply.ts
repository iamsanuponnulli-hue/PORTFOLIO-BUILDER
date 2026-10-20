import type { Operation, SectionType, SiteSpec } from '@pb/schema';
import { hasVariant, NAV_VARIANTS, SECTION_CATALOG } from './catalog.ts';
import { getAt, setAt } from './paths.ts';
import type { SiteState } from './types.ts';

export class OperationError extends Error {}

type Section = SiteSpec['sections'][number];

const fail = (msg: string): never => {
  throw new OperationError(msg);
};

function findSection(state: SiteState, id: string): number {
  const i = state.spec.sections.findIndex((s) => s.id === id);
  return i >= 0 ? i : fail(`No section "${id}"`);
}

function withSections(state: SiteState, sections: Section[]): SiteState {
  return { ...state, spec: { ...state.spec, sections } };
}

function newSectionId(state: SiteState, type: SectionType): string {
  const taken = new Set(state.spec.sections.map((s) => s.id));
  if (!taken.has(type)) return type;
  for (let n = 2; ; n++) if (!taken.has(`${type}-${n}`)) return `${type}-${n}`;
}

const clampIndex = (i: number, len: number) => Math.max(0, Math.min(i, len));

/**
 * Applies one operation and returns the new state. Pure: the input is never mutated.
 * Throws OperationError for operations that don't fit the current state.
 */
export function apply(state: SiteState, op: Operation): SiteState {
  switch (op.op) {
    case 'updateContent':
      return { ...state, content: setAt(state.content, op.path, op.value) };

    case 'addItem': {
      const arr = getAt(state.content, op.path);
      if (!Array.isArray(arr)) fail(`"${op.path}" is not a list`);
      return { ...state, content: setAt(state.content, op.path, [...(arr as unknown[]), op.item]) };
    }

    case 'removeItem': {
      const arr = getAt(state.content, op.path);
      if (!Array.isArray(arr)) fail(`"${op.path}" is not a list`);
      const next = (arr as { id?: string }[]).filter((x) => x?.id !== op.id);
      if (next.length === (arr as unknown[]).length) fail(`No item "${op.id}" in ${op.path}`);
      return { ...state, content: setAt(state.content, op.path, next) };
    }

    case 'updateTheme': {
      const t = state.spec.theme;
      const p = op.tokens;
      const theme = {
        ...t,
        ...p,
        colors: p.colors
          ? {
              light: { ...t.colors.light, ...p.colors.light },
              dark: { ...t.colors.dark, ...p.colors.dark },
            }
          : t.colors,
        fonts: p.fonts ? { ...t.fonts, ...p.fonts } : t.fonts,
      };
      return { ...state, spec: { ...state.spec, theme } };
    }

    case 'addSection': {
      if (!hasVariant(op.type, op.variant)) fail(`"${op.variant}" isn't a layout for ${op.type}`);
      const sections = state.spec.sections.slice();
      const section: Section = {
        id: newSectionId(state, op.type),
        type: op.type,
        variant: op.variant,
        visible: true,
        options: {},
        custom: false,
      };
      sections.splice(clampIndex(op.index, sections.length), 0, section);
      return withSections(state, sections);
    }

    case 'removeSection': {
      findSection(state, op.id);
      const custom = { ...state.custom, sections: { ...state.custom.sections } };
      delete custom.sections[op.id];
      return {
        ...withSections(
          state,
          state.spec.sections.filter((s) => s.id !== op.id),
        ),
        custom,
      };
    }

    case 'toggleSection': {
      const i = findSection(state, op.id);
      const sections = state.spec.sections.slice();
      sections[i] = { ...sections[i]!, visible: !sections[i]!.visible };
      return withSections(state, sections);
    }

    case 'moveSection': {
      const i = findSection(state, op.id);
      const sections = state.spec.sections.slice();
      const [s] = sections.splice(i, 1);
      sections.splice(clampIndex(op.index, sections.length), 0, s!);
      return withSections(state, sections);
    }

    case 'setVariant': {
      const i = findSection(state, op.id);
      const s = state.spec.sections[i]!;
      if (!hasVariant(s.type, op.variant)) fail(`"${op.variant}" isn't a layout for ${s.type}`);
      const sections = state.spec.sections.slice();
      sections[i] = { ...s, variant: op.variant };
      return withSections(state, sections);
    }

    case 'setSectionOptions': {
      const i = findSection(state, op.id);
      const sections = state.spec.sections.slice();
      sections[i] = { ...sections[i]!, options: { ...sections[i]!.options, ...op.options } };
      return withSections(state, sections);
    }

    case 'convertToCustom': {
      const i = findSection(state, op.id);
      const sections = state.spec.sections.slice();
      sections[i] = { ...sections[i]!, custom: true };
      const custom = {
        ...state.custom,
        sections: {
          ...state.custom.sections,
          [op.id]: { html: op.html, css: op.css ?? '', js: op.js ?? '' },
        },
      };
      return { ...withSections(state, sections), custom };
    }

    case 'addCustomSection': {
      const sections = state.spec.sections.slice();
      const id = newSectionId(state, 'custom');
      sections.splice(clampIndex(op.index, sections.length), 0, {
        id,
        type: 'custom',
        variant: 'custom',
        visible: true,
        options: op.title ? { title: op.title } : {},
        custom: true,
      });
      const custom = {
        ...state.custom,
        sections: {
          ...state.custom.sections,
          [id]: { html: op.html, css: op.css ?? '', js: op.js ?? '' },
        },
      };
      return { ...withSections(state, sections), custom };
    }

    case 'revertToManaged': {
      const i = findSection(state, op.id);
      if (state.spec.sections[i]!.type === 'custom')
        fail('A custom section has no generated layout to go back to. Remove it instead.');
      const sections = state.spec.sections.slice();
      sections[i] = { ...sections[i]!, custom: false };
      const custom = { ...state.custom, sections: { ...state.custom.sections } };
      delete custom.sections[op.id];
      return { ...withSections(state, sections), custom };
    }

    case 'editCustomCode':
      return {
        ...state,
        custom: { ...state.custom, [op.file === 'custom.css' ? 'css' : 'js']: op.content },
      };

    case 'setSeo':
      return { ...state, spec: { ...state.spec, seo: { ...state.spec.seo, ...op.seo } } };

    case 'setNav':
      if (!NAV_VARIANTS.some((v) => v.id === op.variant))
        fail(`Unknown navigation layout "${op.variant}"`);
      return { ...state, spec: { ...state.spec, nav: { variant: op.variant } } };

    case 'setPages':
      return { ...state, spec: { ...state.spec, pages: { ...state.spec.pages, ...op.pages } } };

    case 'setContactForm':
      return { ...state, contactForm: { ...state.contactForm, ...op.contactForm } };
  }
}

/** Applies several operations in order (one undo step in the editor). */
export const applyAll = (state: SiteState, ops: Operation[]) => ops.reduce(apply, state);

export { SECTION_CATALOG };
