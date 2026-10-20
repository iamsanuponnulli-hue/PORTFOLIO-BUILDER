import { PortfolioContent, type Operation } from '@pb/schema';

/** Numbers in a text ("4.1s", "81%", "2022"), used to spot invented facts. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.'));
}

/** Every string in a value, except ids the app adds itself. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) if (k !== 'id' && k !== 'assetId') strings(x, out);
  return out;
}

export interface ResumeScore {
  valid: boolean;
  /** Numbers in the output that aren't in the resume (should be none). */
  invented: string[];
  /** Share of the resume's employers/schools found in the output. */
  recall: number;
}

/** Fidelity of a parsed resume: valid shape, no invented numbers, facts kept. */
export function scoreResume(source: string, output: unknown): ResumeScore {
  const parsed = PortfolioContent.safeParse(output);
  const text = strings(output).join(' ');
  const have = new Set(numbersIn(source));
  const invented = [...new Set(numbersIn(text).filter((n) => !have.has(n)))];
  const c = parsed.success ? parsed.data : undefined;
  const orgs = c
    ? [...c.experience.map((e) => e.company), ...c.education.map((e) => e.institution)]
    : [];
  const found = orgs.filter((o) => o && source.toLowerCase().includes(o.toLowerCase())).length;
  return { valid: parsed.success, invented, recall: orgs.length ? found / orgs.length : 0 };
}

/** Whether an assistant answer used one of the expected operation kinds. */
export function scoreEdit(ops: Operation[], expect: string[]): boolean {
  return ops.some((o) => expect.includes(o.op));
}
