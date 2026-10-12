/**
 * Pulls plain text out of a resume file on the user's computer. Nothing is uploaded.
 * PDF uses pdf.js; DOCX uses mammoth. Scanned PDFs have no text layer and are
 * reported so the caller can use a vision model or ask for manual entry.
 */

export interface ResumeText {
  text: string;
  pages: number;
  /** True when the file is a scan (images only): text extraction found almost nothing. */
  scanned: boolean;
  kind: 'pdf' | 'docx' | 'text';
}

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

type PdfJs = typeof import('pdfjs-dist');

let pdfjsLoader: () => Promise<PdfJs> = () => import('pdfjs-dist');

/** Lets the browser bundle point pdf.js at its worker file, and tests use the Node build. */
export function configurePdfJs(loader: () => Promise<PdfJs>): void {
  pdfjsLoader = loader;
}

export function detectKind(name: string, mediaType: string): ResumeText['kind'] | undefined {
  if (mediaType === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (
    mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(name)
  )
    return 'docx';
  if (mediaType.startsWith('text/') || /\.(txt|md)$/i.test(name)) return 'text';
  return undefined;
}

async function pdfText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await pdfjsLoader();
  // verbosity 0: text extraction doesn't need font files, so skip warnings about them.
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      } else if (item.str && !line.endsWith(' ')) {
        line += ' ';
      }
    }
    if (line.trim()) lines.push(line);
    pages.push(
      lines
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    );
  }
  await task.destroy();
  return { text: pages.join('\n\n'), pages: pages.length };
}

export async function extractResumeText(
  data: Uint8Array,
  name: string,
  mediaType: string,
): Promise<ResumeText> {
  if (data.byteLength > MAX_RESUME_BYTES)
    throw new Error('This file is larger than 10 MB. Try a smaller PDF.');
  const kind = detectKind(name, mediaType);
  if (!kind) throw new Error('Use a PDF, Word (.docx) or text file.');
  if (kind === 'text') {
    const text = new TextDecoder().decode(data).trim();
    return { text, pages: 1, scanned: false, kind };
  }
  if (kind === 'docx') {
    const mammoth = await import('mammoth');
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    // Browsers read `arrayBuffer`; Node (tests) reads `buffer`.
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer, buffer: data });
    return { text: value.replace(/\n{3,}/g, '\n\n').trim(), pages: 1, scanned: false, kind };
  }
  const { text, pages } = await pdfText(data);
  // A real resume has hundreds of characters per page; a scan has almost none.
  const scanned = text.replace(/\s/g, '').length < 40 * pages;
  return { text, pages, scanned, kind };
}
