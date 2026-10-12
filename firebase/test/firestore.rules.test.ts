import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-portfolio-builder',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const verified = { email_verified: true };
const alice = () => env.authenticatedContext('alice', verified).firestore();
const bob = () => env.authenticatedContext('bob', verified).firestore();

const userDoc = (projectCount = 0) => ({
  displayName: 'Alice',
  email: 'alice@example.com',
  ai: { mode: 'starter', simple: true },
  projectCount,
  createdAt: 1,
});
const project = (ownerId = 'alice', revision = 0) => ({
  ownerId,
  name: 'Alice — Developer',
  profileType: 'developer',
  status: 'draft',
  revision,
  createdAt: 1,
  updatedAt: 1,
});

async function seed(data: Record<string, object>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [path, value] of Object.entries(data))
      await setDoc(doc(ctx.firestore(), path), value);
  });
}

async function createProject(db: ReturnType<typeof alice>, id: string, count: number) {
  const b = writeBatch(db);
  b.set(doc(db, `projects/${id}`), project());
  b.update(doc(db, 'users/alice'), { projectCount: count + 1 });
  return b.commit();
}

describe('users', () => {
  it('lets a user create and read their own doc', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), userDoc()));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });
  it("blocks reading someone else's doc", async () => {
    await seed({ 'users/alice': userDoc() });
    await assertFails(getDoc(doc(bob(), 'users/alice')));
  });
  it('blocks unknown fields such as API keys', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { ...userDoc(), apiKey: 'sk-123' }));
  });
  it('blocks setting projectCount out of range', async () => {
    await seed({ 'users/alice': userDoc() });
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { projectCount: 3 }));
  });
});

describe('usage', () => {
  it('is readable by its owner but never writable by clients', async () => {
    await seed({ 'usage/alice': { month: '2026-10', generations: 1, edits: 2 } });
    await assertSucceeds(getDoc(doc(alice(), 'usage/alice')));
    await assertFails(
      setDoc(doc(alice(), 'usage/alice'), { month: '2026-10', generations: 0, edits: 0 }),
    );
    await assertFails(getDoc(doc(bob(), 'usage/alice')));
  });
});

describe('projects', () => {
  beforeEach(() => seed({ 'users/alice': userDoc(0) }));

  it('creates a project together with the counter', async () => {
    await assertSucceeds(createProject(alice(), 'p1', 0));
  });
  it('rejects a project created without updating the counter', async () => {
    await assertFails(setDoc(doc(alice(), 'projects/p1'), project()));
  });
  it('rejects a 6th project', async () => {
    await seed({ 'users/alice': userDoc(5) });
    await assertFails(createProject(alice(), 'p6', 5));
  });
  it('rejects a project owned by someone else', async () => {
    const db = alice();
    const b = writeBatch(db);
    b.set(doc(db, 'projects/p1'), project('bob'));
    b.update(doc(db, 'users/alice'), { projectCount: 1 });
    await assertFails(b.commit());
  });
  it('requires a verified email for email/password users', async () => {
    const db = env.authenticatedContext('alice', { email_verified: false }).firestore();
    await assertFails(createProject(db, 'p1', 0));
  });
  it('accepts GitHub sign-ins without a verified email flag', async () => {
    const db = env
      .authenticatedContext('alice', {
        email_verified: false,
        firebase: { sign_in_provider: 'github.com' },
      })
      .firestore();
    await assertSucceeds(createProject(db, 'p1', 0));
  });

  describe('existing project', () => {
    beforeEach(() => seed({ 'users/alice': userDoc(1), 'projects/p1': project('alice', 3) }));

    it('allows an update that advances the revision by one', async () => {
      await assertSucceeds(updateDoc(doc(alice(), 'projects/p1'), { name: 'New', revision: 4 }));
    });
    it('rejects a stale write (same revision)', async () => {
      await assertFails(updateDoc(doc(alice(), 'projects/p1'), { name: 'New', revision: 3 }));
    });
    it('rejects changing the owner', async () => {
      await assertFails(updateDoc(doc(alice(), 'projects/p1'), { ownerId: 'bob', revision: 4 }));
    });
    it('hides the project from other users', async () => {
      await assertFails(getDoc(doc(bob(), 'projects/p1')));
      await assertFails(updateDoc(doc(bob(), 'projects/p1'), { name: 'x', revision: 4 }));
    });
    it('deletes together with the counter', async () => {
      const db = alice();
      const b = writeBatch(db);
      b.delete(doc(db, 'projects/p1'));
      b.update(doc(db, 'users/alice'), { projectCount: 0 });
      await assertSucceeds(b.commit());
    });
    it('rejects a delete that leaves the counter unchanged', async () => {
      await assertFails(deleteDoc(doc(alice(), 'projects/p1')));
    });
    it('allows immutable version snapshots for the owner only', async () => {
      const v = { source: 'manual', createdAt: 2, summary: 'Saved' };
      await assertSucceeds(setDoc(doc(alice(), 'projects/p1/versions/v1'), v));
      await assertFails(updateDoc(doc(alice(), 'projects/p1/versions/v1'), { summary: 'x' }));
      await assertFails(getDoc(doc(bob(), 'projects/p1/versions/v1')));
    });
  });
});

describe('anything else', () => {
  it('is closed', async () => {
    await assertFails(setDoc(doc(alice(), 'admin/settings'), { x: 1 }));
  });
});
