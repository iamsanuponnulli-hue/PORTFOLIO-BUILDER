import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  configurePdfJs,
  extractResumeText,
  importGithub,
  readmeSummary,
  variantWidths,
} from '../src/index.ts';

const fixture = (f: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', f)));

beforeAll(() => {
  // Node uses pdf.js's legacy build; the browser bundle uses the modern one.
  configurePdfJs(() => import('pdfjs-dist/legacy/build/pdf.mjs') as never);
});

describe('resume text', () => {
  it('reads a PDF on this computer, page by page', async () => {
    const r = await extractResumeText(fixture('resume.pdf'), 'cv.pdf', 'application/pdf');
    expect(r.kind).toBe('pdf');
    expect(r.pages).toBe(2);
    expect(r.scanned).toBe(false);
    expect(r.text).toContain('Jane Doe');
    expect(r.text).toContain('cut page load time from 4.1s to 1.3s');
    expect(r.text).toContain('Skills: TypeScript, Go, SQL');
  });

  it('recognises a scanned PDF with no text', async () => {
    const r = await extractResumeText(fixture('scanned.pdf'), 'scan.pdf', 'application/pdf');
    expect(r.scanned).toBe(true);
  });

  it('reads a Word document', async () => {
    const r = await extractResumeText(fixture('resume.docx'), 'cv.docx', '');
    expect(r.kind).toBe('docx');
    expect(r.text).toContain('Priya Shah');
    expect(r.text).toContain('University of Texas at Austin');
  });

  it('rejects other file types and oversized files', async () => {
    await expect(extractResumeText(new Uint8Array(10), 'cv.pages', '')).rejects.toThrow(
      'PDF, Word',
    );
    await expect(
      extractResumeText(new Uint8Array(11 * 1024 * 1024), 'cv.pdf', 'application/pdf'),
    ).rejects.toThrow('10 MB');
  });
});

describe('GitHub import', () => {
  const repos = [
    {
      id: 1,
      name: 'tidepool',
      description: 'Offline-first notes',
      html_url: 'https://github.com/jane/tidepool',
      homepage: 'https://tidepool.dev',
      language: 'TypeScript',
      topics: ['notes'],
      stargazers_count: 50,
      fork: false,
      archived: false,
      pushed_at: '2026-01-01',
    },
    {
      id: 2,
      name: 'pg-snap',
      description: null,
      html_url: 'https://github.com/jane/pg-snap',
      homepage: '',
      language: 'Go',
      stargazers_count: 80,
      fork: false,
      archived: false,
      pushed_at: '2025-01-01',
    },
    {
      id: 3,
      name: 'forked-thing',
      description: 'x',
      html_url: '',
      homepage: null,
      language: null,
      stargazers_count: 999,
      fork: true,
      archived: false,
      pushed_at: '2026-01-01',
    },
    {
      id: 4,
      name: 'old',
      description: 'x',
      html_url: '',
      homepage: null,
      language: null,
      stargazers_count: 999,
      fork: false,
      archived: true,
      pushed_at: '2026-01-01',
    },
  ];
  const fetchFor = (status = 200) =>
    (async (url: string) => {
      if (status !== 200) return new Response('{}', { status });
      if (url.endsWith('/users/jane'))
        return Response.json({
          name: 'Jane Doe',
          bio: 'Builder',
          location: 'Lisbon',
          blog: '',
          html_url: 'https://github.com/jane',
        });
      if (url.includes('/users/jane/repos')) return Response.json(repos);
      if (url.endsWith('/pg-snap/readme'))
        return new Response(
          '# pg-snap\n\n[![CI](x)](y)\n\nSnapshots **PostgreSQL** test databases in under a second.\n\n## Install',
        );
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

  it('imports own repositories, best first, with README summaries', async () => {
    const r = await importGithub('https://github.com/jane', fetchFor());
    expect(r.profile.name).toBe('Jane Doe');
    expect(r.projects.map((p) => p.title)).toEqual(['Pg Snap', 'tidepool']);
    expect(r.projects[0]!.summary).toBe('Snapshots PostgreSQL test databases in under a second.');
    expect(r.projects[1]!.links).toEqual([
      { label: 'GitHub', url: 'https://github.com/jane/tidepool' },
      { label: 'Live site', url: 'https://tidepool.dev' },
    ]);
    expect(r.projects[1]!.tags).toEqual(['notes']);
  });

  it('explains common failures', async () => {
    await expect(importGithub('jane', fetchFor(404))).rejects.toThrow('No GitHub user');
    await expect(importGithub('jane', fetchFor(403))).rejects.toThrow('limiting');
    await expect(importGithub('not a name!', fetchFor())).rejects.toThrow("doesn't look like");
  });

  it('summarises READMEs without Markdown noise', () => {
    expect(
      readmeSummary('<!-- x -->\n# T\n\n![logo](a.png)\n\nA [tool](https://x) for `things`.'),
    ).toBe('A tool for things.');
  });
});

describe('image sizes', () => {
  it('never upscales and always keeps the largest size', () => {
    expect(variantWidths(3000)).toEqual([480, 960, 1600]);
    expect(variantWidths(1200)).toEqual([480, 960, 1200]);
    expect(variantWidths(300)).toEqual([300]);
  });
});
