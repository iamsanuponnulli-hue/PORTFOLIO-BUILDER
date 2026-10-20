/** Code editor for code mode (CodeMirror 6), loaded only when code mode opens. */
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

const views = new Map<number, EditorView>();
let next = 1;

const LANG = { html, css, javascript } as const;

const theme = (dark: boolean) =>
  EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: dark ? '#16181d' : '#ffffff',
        color: dark ? '#e6e6e6' : '#1f2328',
      },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      '.cm-gutters': {
        backgroundColor: dark ? '#16181d' : '#f6f8fa',
        color: dark ? '#7d8590' : '#59636e',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: dark ? '#ffffff0a' : '#0969da0a' },
      '.cm-activeLineGutter': { backgroundColor: dark ? '#ffffff0f' : '#0969da14' },
      '&.cm-focused .cm-cursor': { borderLeftColor: dark ? '#e6e6e6' : '#1f2328' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: dark ? '#264f78' : '#b6d7ff',
      },
    },
    { dark },
  );

export function mount(
  host: HTMLElement,
  text: string,
  language: keyof typeof LANG,
  readOnly: boolean,
  dark: boolean,
): number {
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        (LANG[language] ?? html)(),
        theme(dark),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.lineWrapping,
      ],
    }),
  });
  host.style.height = '100%';
  const id = next++;
  views.set(id, view);
  return id;
}

export const getText = (id: number) => views.get(id)?.state.doc.toString() ?? '';

export function setText(id: number, text: string): void {
  const v = views.get(id);
  if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
}

/** Puts the cursor on a line (1-based) and scrolls to it, e.g. for an error. */
export function goToLine(id: number, line: number): void {
  const v = views.get(id);
  if (!v) return;
  const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
  v.dispatch({ selection: { anchor: l.from }, scrollIntoView: true });
  v.focus();
}

export function destroy(id: number): void {
  views.get(id)?.destroy();
  views.delete(id);
}
