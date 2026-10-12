/** Pulls the first complete JSON object or array out of a model's reply. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    // fall through: find the first balanced {...} or [...]
  }
  const start = body.search(/[[{]/);
  if (start < 0) throw new SyntaxError('No JSON found in the reply');
  const open = body[start]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new SyntaxError('The JSON in the reply was cut off');
}
