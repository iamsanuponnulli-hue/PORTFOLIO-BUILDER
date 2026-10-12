import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface KeyRecord {
  provider: string;
  label: string;
  last4: string;
  baseUrl?: string;
  addedAt: number;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
}

export interface FileRecord {
  /** `${projectId}/${fileId}` */
  key: string;
  projectId: string;
  fileId: string;
  kind: 'image' | 'resume';
  mediaType: string;
  blob: Blob;
  /** Resized variants for images, keyed by width. */
  variants?: Record<number, Blob>;
  width?: number;
  height?: number;
  alt?: string;
  name?: string;
  createdAt: number;
}

export interface DraftRecord {
  projectId: string;
  /** Last revision synced to the cloud when this draft was saved. */
  baseRevision: number;
  /** JSON of the project fields that changed. */
  data: string;
  savedAt: number;
}

interface PbDB extends DBSchema {
  meta: { key: string; value: CryptoKey };
  keys: { key: string; value: KeyRecord };
  files: { key: string; value: FileRecord; indexes: { byProject: string } };
  drafts: { key: string; value: DraftRecord };
}

export type Db = IDBPDatabase<PbDB>;

const NAME = 'portfolio-builder';

let dbPromise: Promise<Db> | undefined;

export function openStore(name = NAME): Promise<Db> {
  if (name !== NAME) return open(name);
  return (dbPromise ??= open(name));
}

function open(name: string) {
  return openDB<PbDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore('meta');
      db.createObjectStore('keys', { keyPath: 'provider' });
      db.createObjectStore('files', { keyPath: 'key' }).createIndex('byProject', 'projectId');
      db.createObjectStore('drafts', { keyPath: 'projectId' });
    },
  });
}
