import type { Firestore } from 'firebase-admin/firestore';

interface Bucket {
  deleteFiles(opts: { prefix: string }): Promise<unknown>;
}

/** Removes everything a deleted account owned: projects (with versions), user and usage docs, files. */
export async function deleteUserData(db: Firestore, bucket: Bucket, uid: string): Promise<number> {
  const projects = await db.collection('projects').where('ownerId', '==', uid).get();
  for (const p of projects.docs) await db.recursiveDelete(p.ref);
  await db.doc(`users/${uid}`).delete();
  await db.doc(`usage/${uid}`).delete();
  await bucket.deleteFiles({ prefix: `users/${uid}/` });
  return projects.size;
}
