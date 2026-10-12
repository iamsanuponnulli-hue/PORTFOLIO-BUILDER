/**
 * Content paths address a value inside PortfolioContent, e.g.
 *   "profile.name", "projects.p1.title", "experience.e2.bullets.0".
 * Array items with an `id` are addressed by that id (stable across reordering);
 * arrays of plain values are addressed by index.
 */

type Json = unknown;

export function splitPath(path: string): string[] {
  const parts = path.split('.').filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error('Empty content path');
  for (const p of parts) {
    if (p === '__proto__' || p === 'constructor' || p === 'prototype') {
      throw new Error(`Invalid path segment: ${p}`);
    }
  }
  return parts;
}

function indexIn(arr: Json[], key: string): number {
  const byId = arr.findIndex(
    (v) => typeof v === 'object' && v !== null && (v as { id?: unknown }).id === key,
  );
  if (byId >= 0) return byId;
  if (/^\d+$/.test(key)) {
    const i = Number(key);
    if (i < arr.length) return i;
  }
  return -1;
}

export function getAt(root: Json, path: string): Json {
  let cur: Json = root;
  for (const key of splitPath(path)) {
    if (Array.isArray(cur)) {
      const i = indexIn(cur, key);
      if (i < 0) return undefined;
      cur = cur[i];
    } else if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, Json>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Returns a copy of root with the value at path replaced (structural sharing, no mutation). */
export function setAt<T>(root: T, path: string, value: Json): T {
  const keys = splitPath(path);
  const go = (node: Json, i: number): Json => {
    const key = keys[i]!;
    const last = i === keys.length - 1;
    if (Array.isArray(node)) {
      const idx = indexIn(node, key);
      if (idx < 0) throw new Error(`No item "${key}" at ${keys.slice(0, i).join('.') || 'root'}`);
      const copy = node.slice();
      copy[idx] = last ? value : go(node[idx], i + 1);
      return copy;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, Json>;
      if (!last && !(key in obj))
        throw new Error(`No field "${key}" at ${keys.slice(0, i).join('.') || 'root'}`);
      return { ...obj, [key]: last ? value : go(obj[key], i + 1) };
    }
    throw new Error(`Cannot set "${key}" on a non-object at ${keys.slice(0, i).join('.')}`);
  };
  return go(root, 0) as T;
}
