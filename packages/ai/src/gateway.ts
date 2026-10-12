import { generateText, type LanguageModel, type ModelMessage } from 'ai';
import type { z } from 'zod';
import { AiError, toAiError } from './errors.ts';
import { extractJson } from './json.ts';

export interface JsonTask<T> {
  model: LanguageModel;
  providerLabel: string;
  system: string;
  /** User content: text, or text plus images. */
  content: string | Exclude<ModelMessage, { role: 'system' | 'assistant' | 'tool' }>['content'];
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface TaskResult<T> {
  value: T;
  usage: { inputTokens?: number; outputTokens?: number };
  /** True when the first answer needed a repair round. */
  repaired: boolean;
}

const JSON_RULES =
  'Reply with one JSON value only: no explanation, no markdown fences. Use double quotes and no trailing commas.';

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

/**
 * Asks a model for JSON and validates it against a schema. Works with any model:
 * no provider-specific structured-output feature is required. If the first reply
 * doesn't parse or validate, the model gets one chance to fix it.
 */
export async function runJsonTask<T>(task: JsonTask<T>): Promise<TaskResult<T>> {
  const messages: ModelMessage[] = [{ role: 'user', content: task.content } as ModelMessage];
  const usage = { inputTokens: 0, outputTokens: 0 };

  const call = async () => {
    try {
      const r = await generateText({
        model: task.model,
        system: `${task.system}\n\n${JSON_RULES}`,
        messages,
        maxOutputTokens: task.maxOutputTokens ?? 8000,
        maxRetries: 1,
        abortSignal: task.signal,
      });
      usage.inputTokens += r.usage.inputTokens ?? 0;
      usage.outputTokens += r.usage.outputTokens ?? 0;
      if (r.finishReason === 'content-filter') {
        throw new AiError('refused', 'The model declined this request. Try another model.');
      }
      return r.text;
    } catch (e) {
      throw toAiError(e, task.providerLabel);
    }
  };

  const check = (text: string): { ok: true; value: T } | { ok: false; feedback: string } => {
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      return { ok: false, feedback: `Your reply wasn't valid JSON (${(e as Error).message}).` };
    }
    const r = task.schema.safeParse(parsed);
    return r.success
      ? { ok: true, value: r.data }
      : {
          ok: false,
          feedback: `Your JSON didn't match the required shape:\n${describeIssues(r.error)}`,
        };
  };

  const first = await call();
  const a = check(first);
  if (a.ok) return { value: a.value, usage, repaired: false };

  messages.push({ role: 'assistant', content: first });
  messages.push({ role: 'user', content: `${a.feedback}\nSend the corrected JSON only.` });
  const second = await call();
  const b = check(second);
  if (b.ok) return { value: b.value, usage, repaired: true };
  throw new AiError(
    'invalid_output',
    "The model's answer wasn't usable. Try again, or pick a more capable model.",
  );
}
