import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-portfolio-builder',
    storage: { rules: readFileSync(resolve(__dirname, '../storage.rules'), 'utf8') },
  });
});
afterAll(() => env.cleanup());

const storage = (uid: string) => env.authenticatedContext(uid).storage();
const bytes = (n: number) => new Uint8Array(n);

describe('storage', () => {
  it('lets a user upload and read an image in their own folder', async () => {
    const r = ref(storage('alice'), 'users/alice/projects/p1/assets/a.webp');
    await assertSucceeds(uploadBytes(r, bytes(100), { contentType: 'image/webp' }));
    await assertSucceeds(getBytes(r));
  });
  it("blocks another user's folder", async () => {
    const r = ref(storage('bob'), 'users/alice/projects/p1/assets/b.webp');
    await assertFails(uploadBytes(r, bytes(100), { contentType: 'image/webp' }));
  });
  it('blocks non-image files in assets', async () => {
    const r = ref(storage('alice'), 'users/alice/projects/p1/assets/x.html');
    await assertFails(uploadBytes(r, bytes(100), { contentType: 'text/html' }));
  });
  it('accepts a PDF resume but not other types', async () => {
    const ok = ref(storage('alice'), 'users/alice/projects/p1/resume/cv.pdf');
    await assertSucceeds(uploadBytes(ok, bytes(100), { contentType: 'application/pdf' }));
    const bad = ref(storage('alice'), 'users/alice/projects/p1/resume/cv.exe');
    await assertFails(uploadBytes(bad, bytes(100), { contentType: 'application/octet-stream' }));
  });
  it('keeps version snapshots immutable', async () => {
    const r = ref(storage('alice'), 'users/alice/projects/p1/versions/v1.json');
    await assertSucceeds(uploadBytes(r, bytes(10), { contentType: 'application/json' }));
    await assertFails(uploadBytes(r, bytes(10), { contentType: 'application/json' }));
  });
  it('closes everything outside users/', async () => {
    const r = ref(storage('alice'), 'public/x.png');
    await assertFails(uploadBytes(r, bytes(10), { contentType: 'image/png' }));
  });
});
