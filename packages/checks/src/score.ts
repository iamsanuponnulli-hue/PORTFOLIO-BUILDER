import { readableTheme, type CheckResult, type Severity, type SiteState } from '@pb/renderer';
import type { Operation } from '@pb/schema';

export type Category = 'accessibility' | 'seo' | 'performance' | 'responsive' | 'content';

export const CATEGORIES: { id: Category; label: string; weight: number }[] = [
  { id: 'accessibility', label: 'Accessibility', weight: 30 },
  { id: 'content', label: 'Content', weight: 25 },
  { id: 'seo', label: 'Search & sharing', weight: 15 },
  { id: 'performance', label: 'Speed', weight: 15 },
  { id: 'responsive', label: 'Phones & tablets', weight: 15 },
];

/** What a one-click fix does (the app runs the AI ones with the person's model). */
export type FixKind =
  | 'contrast'
  | 'seoDescription'
  | 'seoTitle'
  | 'altText'
  | 'hideSection'
  | 'editContent'
  | 'contactSettings'
  | 'siteAddress';

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  message: string;
  sectionId?: string;
  path?: string;
  fix?: FixKind;
  /** Label for the fix button. */
  fixLabel?: string;
}

/** Results of the full checks run in hidden previews (see browser.ts). */
export interface FullReport {
  widths: {
    width: number;
    overflow: boolean;
    /** Elements wider than the screen (short CSS-like descriptions). */
    offenders: string[];
    axe: { id: string; impact: string; help: string; nodes: number }[];
    brokenLinks: string[];
  }[];
}

export interface ImageStat {
  fileId: string;
  bytes: number;
  hasVariants: boolean;
}

export interface Score {
  total: number;
  categories: Record<Category, number>;
  findings: Finding[];
  /** True when the full checks ran (otherwise only instant ones). */
  full: boolean;
}

const PENALTY: Record<Severity, number> = { error: 25, warning: 10, info: 3 };
const AXE_PENALTY: Record<string, [number, Severity]> = {
  critical: [20, 'error'],
  serious: [12, 'error'],
  moderate: [6, 'warning'],
  minor: [3, 'info'],
};

function categorize(c: CheckResult): Finding {
  const f: Finding = { ...c, category: 'content' };
  if (c.id.startsWith('contrast-')) {
    f.category = 'accessibility';
    f.fix = 'contrast';
    f.fixLabel = 'Fix colours';
  } else if (c.id.startsWith('alt-')) {
    f.category = 'accessibility';
    f.fix = 'altText';
    f.fixLabel = 'Add descriptions';
  } else if (c.id === 'seo-description') {
    f.category = 'seo';
    f.fix = 'seoDescription';
    f.fixLabel = 'Write one';
  } else if (c.id.startsWith('empty-')) {
    f.fix = 'hideSection';
    f.fixLabel = 'Hide section';
  } else if (c.id === 'form-config' || c.id === 'no-contact') {
    f.fix = 'contactSettings';
    f.fixLabel = 'Open contact settings';
  } else if (c.id.startsWith('placeholder-') || c.id === 'no-name') {
    f.fix = 'editContent';
    f.fixLabel = 'Edit';
  }
  return f;
}

const MB = 1024 * 1024;

/**
 * The portfolio score: instant checks (every render), plus the full checks when
 * they've run. Each category starts at 100 and loses points per finding.
 */
export function computeScore(
  state: SiteState,
  instant: CheckResult[],
  full?: FullReport,
  images: ImageStat[] = [],
): Score {
  const findings: Finding[] = instant.map(categorize);
  const seo = state.spec.seo;
  const p = state.content.profile;

  if (!/^https:\/\//i.test(seo.url.trim()))
    findings.push({
      id: 'site-address',
      category: 'seo',
      severity: 'info',
      message:
        "Add your site's address (after you publish it) to turn on the sitemap, canonical links and share previews.",
      fix: 'siteAddress',
      fixLabel: 'Add address',
    });
  if (!seo.title.trim() && !(p.name && p.headline))
    findings.push({
      id: 'seo-title',
      category: 'seo',
      severity: 'warning',
      message: 'The page title is just your name. Add a headline or a title for search results.',
      fix: 'seoTitle',
      fixLabel: 'Set a title',
    });

  const total = images.reduce((n, i) => n + i.bytes, 0);
  if (total > 8 * MB)
    findings.push({
      id: 'page-weight',
      category: 'performance',
      severity: 'warning',
      message: `Your images add up to ${(total / MB).toFixed(1)} MB. Remove some or use smaller ones so the site loads fast on phones.`,
    });
  for (const im of images.filter((i) => !i.hasVariants && i.bytes > 600 * 1024))
    findings.push({
      id: `image-size-${im.fileId}`,
      category: 'performance',
      severity: 'warning',
      message: 'A large image has no smaller sizes for phones. Upload it again to create them.',
    });

  if (full) {
    const seen = new Set<string>();
    for (const w of full.widths) {
      if (w.overflow)
        findings.push({
          id: `overflow-${w.width}`,
          category: 'responsive',
          severity: 'error',
          message: `At ${w.width}px wide the page scrolls sideways${w.offenders.length ? ` (${w.offenders.slice(0, 3).join(', ')})` : ''}. Check custom code or long words and links.`,
        });
      for (const v of w.axe) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        const [, severity] = AXE_PENALTY[v.impact] ?? AXE_PENALTY['minor']!;
        findings.push({
          id: `axe-${v.id}`,
          category: 'accessibility',
          severity,
          message: `${v.help} (${v.nodes} ${v.nodes === 1 ? 'place' : 'places'})`,
          ...(v.id === 'color-contrast'
            ? { fix: 'contrast' as const, fixLabel: 'Fix colours' }
            : {}),
        });
      }
      for (const href of w.brokenLinks) {
        if (seen.has(`link-${href}`)) continue;
        seen.add(`link-${href}`);
        findings.push({
          id: `link-${href}`,
          category: 'content',
          severity: 'warning',
          message: `The link "${href}" points to something that isn't on the page.`,
        });
      }
    }
  }

  const categories = Object.fromEntries(CATEGORIES.map((c) => [c.id, 100])) as Record<
    Category,
    number
  >;
  for (const f of findings) {
    const axeImpact = f.id.startsWith('axe-')
      ? (full?.widths.flatMap((w) => w.axe).find((v) => `axe-${v.id}` === f.id)?.impact ?? '')
      : '';
    const cost = AXE_PENALTY[axeImpact]?.[0] ?? PENALTY[f.severity];
    categories[f.category] = Math.max(0, categories[f.category] - cost);
  }
  const weight = CATEGORIES.reduce((n, c) => n + c.weight, 0);
  const totalScore = Math.round(
    CATEGORIES.reduce((n, c) => n + categories[c.id] * c.weight, 0) / weight,
  );
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { total: totalScore, categories, findings, full: !!full };
}

/** Content path of an image's alt text, by asset id. */
export function altPath(state: SiteState, assetId: string): string | undefined {
  if (state.content.profile.photo?.assetId === assetId) return 'profile.photo.alt';
  for (const proj of state.content.projects) {
    const i = proj.images.findIndex((im) => im.assetId === assetId);
    if (i >= 0) return `projects.${proj.id}.images.${i}.alt`;
  }
  return undefined;
}

const trimTo = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`;

/**
 * Operations for fixes that need no AI. Returns undefined when the fix needs the
 * person (open a panel) or an AI call (written by the app with their model).
 */
export function fixOperations(state: SiteState, f: Finding): Operation[] | undefined {
  const p = state.content.profile;
  switch (f.fix) {
    case 'contrast':
      return [{ op: 'updateTheme', tokens: { colors: readableTheme(state.spec.theme).colors } }];
    case 'seoTitle': {
      const title = trimTo([p.name, p.headline].filter(Boolean).join(' — ') || 'Portfolio', 70);
      return [{ op: 'setSeo', seo: { title } }];
    }
    case 'seoDescription': {
      const source =
        p.tagline ||
        [p.headline, p.location && `based in ${p.location}`].filter(Boolean).join(', ') ||
        p.bio.split(/\n/)[0] ||
        '';
      if (!source.trim()) return undefined;
      const text = p.name && !source.includes(p.name) ? `${p.name}: ${source}` : source;
      return [{ op: 'setSeo', seo: { description: trimTo(text.trim(), 160) } }];
    }
    case 'hideSection':
      return f.sectionId ? [{ op: 'toggleSection', id: f.sectionId }] : undefined;
    case 'altText': {
      // Plain descriptions from context; the AI version describes what the image shows.
      const ops: Operation[] = [];
      if (p.photo && !p.photo.alt.trim())
        ops.push({
          op: 'updateContent',
          path: 'profile.photo.alt',
          value: p.name ? `Portrait of ${p.name}` : 'Portrait',
        });
      for (const proj of state.content.projects)
        proj.images.forEach((im, i) => {
          if (!im.alt.trim())
            ops.push({
              op: 'updateContent',
              path: `projects.${proj.id}.images.${i}.alt`,
              value: `${proj.title}${proj.images.length > 1 ? ` — image ${i + 1}` : ''}`,
            });
        });
      return ops.length ? ops : undefined;
    }
    default:
      return undefined;
  }
}
