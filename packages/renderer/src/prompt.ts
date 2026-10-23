import { LIBRARY_TYPES, NAV_VARIANTS, SECTION_CATALOG } from './catalog.ts';
import { PRESETS } from './defaults.ts';
import { FONTS } from './fonts.ts';

/** The section library, presets and fonts as text, for AI prompts (app and evals). */
export function catalogText(): string {
  const lines = ['Section types and their layouts (type: layout ids):'];
  for (const t of LIBRARY_TYPES)
    lines.push(
      `- ${t} (${SECTION_CATALOG[t].label}): ${SECTION_CATALOG[t].variants.map((v) => `${v.id} = ${v.label}`).join('; ')}`,
    );
  lines.push(`Navigation layouts: ${NAV_VARIANTS.map((v) => v.id).join(', ')}`);
  lines.push(`Theme presets: ${PRESETS.map((p) => p.id).join(', ')}`);
  lines.push(`Fonts: ${FONTS.map((f) => `${f.family} (${f.category})`).join(', ')}`);
  return lines.join('\n');
}
