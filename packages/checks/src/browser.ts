import { previewDocument, type SiteFiles } from '@pb/renderer';
import { CHECK_WIDTHS, runnerScript } from './runner.ts';
import type { FullReport } from './score.ts';

/**
 * Runs the full checks (page only, needs a DOM): the site is loaded in hidden,
 * sandboxed iframes at phone, tablet and desktop widths with axe-core inside.
 */
export async function runFullChecks(
  files: SiteFiles,
  axeSource: string,
  widths = CHECK_WIDTHS,
  timeoutMs = 20_000,
): Promise<FullReport> {
  const axe = `<script>${axeSource.replace(/<\/script/gi, '<\\/script')}</script>`;
  const out: FullReport = { widths: [] };
  for (const width of widths) {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const html = previewDocument(files, 'index.html', {
      bodyEnd: `${axe}\n<script>${runnerScript(runId, width)}</script>\n`,
    });
    out.widths.push(await runOne(html, runId, width, timeoutMs));
  }
  return out;
}

function runOne(
  html: string,
  runId: string,
  width: number,
  timeoutMs: number,
): Promise<FullReport['widths'][number]> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: 'fixed',
      left: '-20000px',
      top: '0',
      width: `${width}px`,
      height: '900px',
      border: '0',
      visibility: 'hidden',
    });
    const finish = (r: FullReport['widths'][number]) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve(r);
    };
    const onMessage = (e: MessageEvent) => {
      const m = e.data as { pbCheck?: string } & FullReport['widths'][number];
      if (e.source !== frame.contentWindow || m?.pbCheck !== runId) return;
      finish({
        width,
        overflow: !!m.overflow,
        offenders: (m.offenders ?? []).slice(0, 5).map(String),
        axe: (m.axe ?? []).slice(0, 50),
        brokenLinks: (m.brokenLinks ?? []).slice(0, 20).map(String),
      });
    };
    const timer = setTimeout(
      () => finish({ width, overflow: false, offenders: [], axe: [], brokenLinks: [] }),
      timeoutMs,
    );
    window.addEventListener('message', onMessage);
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
