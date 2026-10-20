import type { SiteState } from '@pb/renderer';

const FORM_NOTES: Record<string, string> = {
  formspree: 'Messages from the contact form go to your Formspree inbox.',
  web3forms: 'Messages from the contact form are emailed to you by Web3Forms.',
  endpoint: 'Messages from the contact form go to the form service address you set.',
  link: 'The contact button opens the form link you set.',
};

/** README.md inside the ZIP: what's in it and how to put it online for free. */
export function readme(state: SiteState, o: { resume: boolean; notes: string[] }): string {
  const name = state.content.profile.name || 'My';
  const lines = [
    `# ${name} — portfolio website`,
    '',
    'A plain HTML, CSS and JavaScript website: no build step, no tracking, no frameworks.',
    'Open `index.html` in a browser to see it on your computer.',
    '',
    '## Put it online (free)',
    '',
    '**GitHub Pages**',
    '1. Create a repository on GitHub (for example `yourname.github.io`).',
    '2. Upload every file and folder from this ZIP (keep the folders as they are).',
    '3. In the repository, open Settings → Pages, choose "Deploy from a branch", pick `main` and `/ (root)`.',
    '4. After a minute your site is at `https://<your-username>.github.io/<repository>/`.',
    '',
    '**Netlify Drop**',
    '1. Go to https://app.netlify.com/drop and drag the unzipped folder onto the page.',
    '2. Claim the site to keep it and choose its address.',
    '',
    '**Cloudflare Pages, any web host**',
    'Upload the files as they are. Every link is relative, so the site works in any folder.',
    '',
    '## After publishing',
    '',
    '- Add your site address in the builder (Site settings → Address) and export again.',
    '  That turns on the sitemap, canonical links and the image shown when the link is shared.',
  ];
  const form = FORM_NOTES[state.contactForm.service];
  if (form) lines.push(`- ${form}`);
  if (o.resume) lines.push('- `resume.pdf` is the resume you uploaded; the site links to it.');
  lines.push(
    '',
    '## Files',
    '',
    '- `index.html` (and `projects/*.html` for case studies): the pages',
    '- `assets/css/`: `theme.css` (colours and fonts), `base.css`, `sections.css`, `custom.css` (yours)',
    '- `assets/js/`: small scripts for the menu, theme switch and animations',
    '- `assets/img/`: your images in several sizes',
    '- `assets/fonts/`: fonts under the SIL Open Font License',
    '',
    'Edit `custom.css` freely. Other files are regenerated when you export again from the builder.',
  );
  if (o.notes.length) lines.push('', '## Notes', '', ...o.notes.map((n) => `- ${n}`));
  return lines.join('\n') + '\n';
}
