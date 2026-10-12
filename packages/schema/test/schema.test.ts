import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LIMITS,
  Operation,
  PortfolioContent,
  ProjectDoc,
  RelayRequest,
  UserDoc,
} from '../src/index.ts';

describe('defaults', () => {
  it('builds an empty portfolio from nothing', () => {
    const c = PortfolioContent.parse({});
    expect(c.profile.name).toBe('');
    expect(c.projects).toEqual([]);
  });

  it('accepts a minimal project document and fills defaults', () => {
    const p = ProjectDoc.parse({
      ownerId: 'u1',
      name: 'Jane — Developer',
      profileType: 'developer',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(p.goals.tone).toBe('minimal');
    expect(p.spec).toBeUndefined();
    expect(p.revision).toBe(0);
  });

  it('accepts null for optional fields written by Dart', () => {
    const p = ProjectDoc.parse({
      ownerId: 'u1',
      name: 'x',
      profileType: 'designer',
      status: 'draft',
      spec: null,
      currentVersionId: null,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(p.spec).toBeNull();
  });

  it('rejects names longer than the limit', () => {
    const r = ProjectDoc.safeParse({
      ownerId: 'u1',
      name: 'x'.repeat(LIMITS.maxProjectNameLength + 1),
      profileType: 'developer',
      status: 'draft',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(r.success).toBe(false);
  });

  it('defaults AI mode to starter and never has a key field', () => {
    const u = UserDoc.parse({ createdAt: 1 });
    expect(u.ai.mode).toBe('starter');
    expect(JSON.stringify(u)).not.toMatch(/key/i);
  });
});

describe('operations', () => {
  it('validates a known operation', () => {
    expect(Operation.safeParse({ op: 'moveSection', id: 'hero', index: 2 }).success).toBe(true);
  });
  it('rejects unknown operations and bad fields', () => {
    expect(Operation.safeParse({ op: 'deleteEverything' }).success).toBe(false);
    expect(Operation.safeParse({ op: 'moveSection', id: 'hero', index: -1 }).success).toBe(false);
  });
});

describe('patch operations', () => {
  it('only carry the fields being changed', () => {
    const op = Operation.parse({ op: 'setSeo', seo: { title: 'x' } });
    expect(op).toEqual({ op: 'setSeo', seo: { title: 'x' } });
    const cf = Operation.parse({ op: 'setContactForm', contactForm: { value: 'f/1' } });
    expect(cf).toEqual({ op: 'setContactForm', contactForm: { value: 'f/1' } });
  });
});

describe('relay request', () => {
  it('requires at least one message', () => {
    expect(
      RelayRequest.safeParse({ kind: 'edit', messages: [], maxOutputTokens: 10 }).success,
    ).toBe(false);
  });
});

describe('generated artifacts', () => {
  it('templates.json matches current defaults (run pnpm codegen if this fails)', () => {
    const t = JSON.parse(readFileSync(resolve(__dirname, '../generated/templates.json'), 'utf8'));
    expect(t.content).toEqual(PortfolioContent.parse({}));
  });
});
