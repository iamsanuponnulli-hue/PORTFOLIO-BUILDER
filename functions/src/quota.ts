import { STARTER, type UsageDoc } from '@pb/schema';
import type { Firestore } from 'firebase-admin/firestore';
import { RelayError, type Kind } from './relay.ts';

export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

const limitFor = (kind: Kind) =>
  kind === 'generation' ? STARTER.generationsPerMonth : STARTER.editsPerMonth;
const field = (kind: Kind) => (kind === 'generation' ? 'generations' : 'edits');

/** Minimum gap between two Starter requests from the same user. */
export const MIN_INTERVAL_MS = 1500;

type Stored = UsageDoc & { lastAt?: number };

/** Atomically checks and counts one Starter request in usage/{uid}. Resets each month. */
export async function reserve(db: Firestore, uid: string, kind: Kind, now: Date): Promise<void> {
  const ref = db.doc(`usage/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const month = monthKey(now);
    const prev = snap.exists ? (snap.data() as Stored) : undefined;
    const cur: Stored =
      prev && prev.month === month
        ? prev
        : { month, generations: 0, edits: 0, lastAt: prev?.lastAt };
    if (cur.lastAt && now.getTime() - cur.lastAt < MIN_INTERVAL_MS) {
      throw new RelayError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
    }
    if (cur[field(kind)] >= limitFor(kind)) {
      throw new RelayError(
        402,
        'allowance_used',
        `You've used this month's Starter ${field(kind)}. Add your own key in Settings to keep going.`,
      );
    }
    tx.set(ref, { ...cur, [field(kind)]: cur[field(kind)] + 1, lastAt: now.getTime() });
  });
}

/** Undoes one reserve() when the provider failed before answering. */
export async function refund(db: Firestore, uid: string, kind: Kind, now: Date): Promise<void> {
  const ref = db.doc(`usage/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const cur = snap.data() as Stored;
    if (cur.month !== monthKey(now) || cur[field(kind)] <= 0) return;
    tx.update(ref, { [field(kind)]: cur[field(kind)] - 1 });
  });
}
