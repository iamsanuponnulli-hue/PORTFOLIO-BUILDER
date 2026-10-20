/** Writes the catalogue the editor reads (sections, layouts, presets, fonts) as JSON. */
import { FONTS, NAV_VARIANTS, PRESETS, SECTION_CATALOG } from '../src/index.ts';

process.stdout.write(
  JSON.stringify({
    sections: SECTION_CATALOG,
    nav: NAV_VARIANTS,
    presets: PRESETS,
    fonts: FONTS.map((f) => ({ family: f.family, category: f.category })),
  }),
);
