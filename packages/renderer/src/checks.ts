import { SECTION_CATALOG } from './catalog.ts';
import { contrast } from './color.ts';
import { formTarget } from './sections/contact.ts';
import { SECTIONS } from './sections/index.ts';
import type { CheckResult, RenderOptions, SiteState } from './types.ts';

/**
 * Placeholders the content assistant leaves instead of guessing facts, e.g. "[X%]",
 * "[N users]", "[TBD]". Export is blocked while any remain.
 */
export const PLACEHOLDER = /\[(?:X|N|#|\?|TBD|TODO)[^\]]{0,24}\]/i;

function walkStrings(value: unknown, path: string, visit: (s: string, path: string) => void): void {
  if (typeof value === 'string') visit(value, path);
  else if (Array.isArray(value))
    value.forEach((v, i) => {
      const key =
        v && typeof v === 'object' && 'id' in v && typeof (v as { id: unknown }).id === 'string'
          ? (v as { id: string }).id
          : String(i);
      walkStrings(v, path ? `${path}.${key}` : key, visit);
    });
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, visit);
}

/** Instant checks run on every render. The full set (axe, layout) runs before export. */
export function checkSite(
  state: SiteState,
  opts: RenderOptions = { mode: 'export' },
): CheckResult[] {
  const out: CheckResult[] = [];
  const t = state.spec.theme;
  const modes = t.colorMode === 'auto' ? (['light', 'dark'] as const) : ([t.colorMode] as const);

  for (const mode of modes) {
    const c = t.colors[mode];
    const label = modes.length > 1 ? ` in ${mode} mode` : '';
    if (contrast(c.text, c.background) < 4.5)
      out.push({
        id: `contrast-text-${mode}`,
        severity: 'error',
        message: `Text is hard to read on the background${label}. Use a darker or lighter text colour.`,
      });
    if (contrast(c.text, c.surface) < 4.5)
      out.push({
        id: `contrast-surface-${mode}`,
        severity: 'error',
        message: `Text is hard to read on cards${label}.`,
      });
    if (contrast(c.muted, c.background) < 4.5)
      out.push({
        id: `contrast-muted-${mode}`,
        severity: 'warning',
        message: `Secondary text (dates, captions) has low contrast${label}.`,
      });
    if (contrast(c.primary, c.background) < 3)
      out.push({
        id: `contrast-primary-${mode}`,
        severity: 'warning',
        message: `Links and buttons don't stand out enough from the background${label}.`,
      });
  }

  const visible = state.spec.sections.filter((s) => s.visible);
  for (const s of visible) {
    if (!s.custom && !SECTIONS[s.type].hasContent(state)) {
      out.push({
        id: `empty-${s.id}`,
        severity: 'warning',
        sectionId: s.id,
        message: `${SECTION_CATALOG[s.type].label} has nothing to show yet and will be left out of your site. ${SECTIONS[s.type].emptyHint}`,
      });
    }
  }

  const p = state.content.profile;
  const hasContact =
    !!p.email.trim() ||
    p.socials.some((x) => x.url.trim()) ||
    !!formTarget(state.contactForm) ||
    (state.contactForm.service === 'link' && !!state.contactForm.value.trim());
  if (!hasContact)
    out.push({
      id: 'no-contact',
      severity: 'warning',
      message: 'Visitors have no way to contact you. Add an email, a social link or a form.',
    });
  if (
    state.contactForm.service !== 'none' &&
    state.contactForm.service !== 'link' &&
    state.contactForm.value.trim() &&
    !formTarget(state.contactForm)
  ) {
    out.push({
      id: 'form-config',
      severity: 'error',
      message: "The contact form's ID or address doesn't look right. Check it in Contact settings.",
    });
  }
  if (!p.name.trim())
    out.push({ id: 'no-name', severity: 'error', message: 'Add your name.', path: 'profile.name' });

  const images = [p.photo, ...state.content.projects.flatMap((x) => x.images)].filter(
    (x): x is NonNullable<typeof x> => !!x,
  );
  const assets = opts.assets ?? {};
  for (const im of images) {
    if (assets[im.assetId] && !im.alt.trim()) {
      out.push({
        id: `alt-${im.assetId}`,
        severity: 'warning',
        message: 'An image has no description for screen readers (alt text).',
      });
    }
  }

  walkStrings(state.content, '', (s, path) => {
    if (PLACEHOLDER.test(s)) {
      out.push({
        id: `placeholder-${path}`,
        severity: 'error',
        path,
        message: `Fill in or remove the placeholder "${PLACEHOLDER.exec(s)![0]}".`,
      });
    }
  });

  if (!state.spec.seo.description.trim() && !p.tagline.trim()) {
    out.push({
      id: 'seo-description',
      severity: 'info',
      message: 'Add a short site description so search results show something useful.',
    });
  }
  return out;
}

/** True when there's nothing that should block a download. */
export const exportReady = (checks: CheckResult[]) => !checks.some((c) => c.severity === 'error');
