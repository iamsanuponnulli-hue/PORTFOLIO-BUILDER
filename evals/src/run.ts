/**
 * Cross-model evals (dev only, never in CI): runs the resume, design and assistant
 * tasks against real models and prints a report. Uses your own key:
 *
 *   PB_EVAL_PROVIDER=gemini PB_EVAL_KEY=… PB_EVAL_MODELS=gemini-2.5-flash,gemini-2.5-pro \
 *     pnpm --filter @pb/evals eval
 *
 * A model goes on the "recommended" list in packages/ai/src/models.ts only when it
 * passes: valid output for every case, no invented numbers, and ≥ 80% of edits right.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  assistantEdit,
  createModel,
  designDirections,
  parseResume,
  providerInfo,
  type ProviderId,
} from '@pb/ai';
import { applyAll, specFromDraft, themeIsReadable } from '@pb/renderer';
import { sampleState } from '@pb/renderer/samples';
import { scoreEdit, scoreResume } from './score.ts';

const provider = process.env['PB_EVAL_PROVIDER'] as ProviderId | undefined;
const apiKey = process.env['PB_EVAL_KEY'];
const models = (process.env['PB_EVAL_MODELS'] ?? '').split(',').filter(Boolean);
if (!provider || !apiKey || !models.length) {
  process.stderr.write('Set PB_EVAL_PROVIDER, PB_EVAL_KEY and PB_EVAL_MODELS (comma separated).\n');
  process.exit(2);
}
const data = (f: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../data', f), 'utf8'));
const resumes = data('resumes.json') as { id: string; text: string }[];
const edits = data('edits.json') as { prompt: string; expect: string[] }[];
const label = providerInfo(provider).label;
const lines = ['# Cross-model eval', '', `Provider: ${label}`, ''];
const catalog = 'See packages/renderer/src/catalog.ts';

for (const id of models) {
  const model = await createModel(
    {
      provider,
      apiKey,
      ...(process.env['PB_EVAL_BASE_URL'] ? { baseUrl: process.env['PB_EVAL_BASE_URL'] } : {}),
    },
    id,
  );
  const out = {
    resumeValid: 0,
    invented: 0,
    recall: 0,
    designs: 0,
    readable: 0,
    edits: 0,
    errors: [] as string[],
  };
  for (const r of resumes) {
    try {
      const res = await parseResume(model, label, { text: r.text });
      const s = scoreResume(r.text, res.value);
      out.resumeValid += s.valid ? 1 : 0;
      out.invented += s.invented.length;
      out.recall += s.recall;
    } catch (e) {
      out.errors.push(`resume ${r.id}: ${(e as Error).message}`);
    }
  }
  try {
    const d = await designDirections(model, label, {
      profileType: 'developer',
      goals: { tone: 'bold' },
      contentSummary: 'Jobs: 2\nProjects: 3',
      briefs: [],
      catalog,
    });
    out.designs = d.value.length;
    out.readable = d.value.filter((x) =>
      themeIsReadable(specFromDraft(x, 'developer').theme),
    ).length;
  } catch (e) {
    out.errors.push(`designs: ${(e as Error).message}`);
  }
  const state = sampleState('developer');
  for (const e of edits) {
    try {
      const r = await assistantEdit(model, label, {
        prompt: e.prompt,
        spec: state.spec,
        content: '',
        catalog,
      });
      applyAll(state, r.value.operations);
      if (scoreEdit(r.value.operations, e.expect)) out.edits++;
    } catch (err) {
      out.errors.push(`edit "${e.prompt}": ${(err as Error).message}`);
    }
  }
  const pass =
    out.resumeValid === resumes.length &&
    out.invented === 0 &&
    out.designs === 3 &&
    out.edits / edits.length >= 0.8;
  lines.push(
    `## ${id} — ${pass ? 'PASS' : 'FAIL'}`,
    '',
    `- Resumes valid: ${out.resumeValid}/${resumes.length}, invented numbers: ${out.invented}, facts kept: ${Math.round((out.recall / resumes.length) * 100)}%`,
    `- Designs: ${out.designs}/3 (${out.readable} readable before repair)`,
    `- Edits right: ${out.edits}/${edits.length}`,
    ...out.errors.map((x) => `- Error: ${x}`),
    '',
  );
  process.stdout.write(`${id}: ${pass ? 'PASS' : 'FAIL'}\n`);
}
const report = resolve(import.meta.dirname, '../report.md');
writeFileSync(report, lines.join('\n'));
process.stdout.write(`Report: ${report}\n`);
