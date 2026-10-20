import { openStore, type Db } from './db.ts';
import { DraftStore, FileStore, UsageStore } from './files.ts';
import { KeyStore } from './keys.ts';

export { KeyStore, type Credentials, type StoredKey } from './keys.ts';
export { DraftStore, FileStore, UsageStore, type NewFile } from './files.ts';
export type { FileRecord, UsageRecord } from './db.ts';

export interface LocalStore {
  keys: KeyStore;
  files: FileStore;
  drafts: DraftStore;
  usage: UsageStore;
  /** Removes everything this app keeps on the device (used on sign-out and account deletion). */
  clearAll(): Promise<void>;
}

export async function openLocalStore(name?: string): Promise<LocalStore> {
  const db: Db = await openStore(name);
  return {
    keys: new KeyStore(db),
    files: new FileStore(db),
    drafts: new DraftStore(db),
    usage: new UsageStore(db),
    async clearAll() {
      const tx = db.transaction(['meta', 'keys', 'files', 'drafts', 'usage'], 'readwrite');
      await Promise.all([
        tx.objectStore('meta').clear(),
        tx.objectStore('keys').clear(),
        tx.objectStore('files').clear(),
        tx.objectStore('drafts').clear(),
        tx.objectStore('usage').clear(),
      ]);
      await tx.done;
    },
  };
}
