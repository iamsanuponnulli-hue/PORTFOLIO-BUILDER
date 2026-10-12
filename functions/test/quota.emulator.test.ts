import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { STARTER } from '@pb/schema';
import { MIN_INTERVAL_MS, refund, reserve } from '../src/quota.ts';

// Runs under `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST.
const app = initializeApp({ projectId: 'demo-portfolio-builder' }, 'quota-test');
const db = getFirestore(app);
const t0 = new Date('2026-10-12T10:00:00Z');
const later = (ms: number, from = t0) => new Date(from.getTime() + ms);

beforeEach(async () => {
  await db.recursiveDelete(db.collection('usage'));
});

describe('Starter allowance', () => {
  it('counts requests per kind', async () => {
    await reserve(db, 'alice', 'generation', t0);
    await reserve(db, 'alice', 'edit', later(MIN_INTERVAL_MS));
    const d = (await db.doc('usage/alice').get()).data();
    expect(d).toMatchObject({ month: '2026-10', generations: 1, edits: 1 });
  });

  it('stops at the monthly limit', async () => {
    let at = t0;
    for (let i = 0; i < STARTER.generationsPerMonth; i++) {
      await reserve(db, 'alice', 'generation', at);
      at = later(MIN_INTERVAL_MS, at);
    }
    await expect(reserve(db, 'alice', 'generation', at)).rejects.toMatchObject({ status: 402 });
  });

  it('resets in a new month', async () => {
    let at = t0;
    for (let i = 0; i < STARTER.generationsPerMonth; i++) {
      await reserve(db, 'alice', 'generation', at);
      at = later(MIN_INTERVAL_MS, at);
    }
    await expect(
      reserve(db, 'alice', 'generation', new Date('2026-11-01T00:00:00Z')),
    ).resolves.toBeUndefined();
  });

  it('rate-limits rapid requests', async () => {
    await reserve(db, 'alice', 'edit', t0);
    await expect(reserve(db, 'alice', 'edit', later(100))).rejects.toMatchObject({ status: 429 });
  });

  it('refund gives one request back', async () => {
    await reserve(db, 'alice', 'edit', t0);
    await refund(db, 'alice', 'edit', t0);
    expect((await db.doc('usage/alice').get()).data()?.edits).toBe(0);
  });
});
