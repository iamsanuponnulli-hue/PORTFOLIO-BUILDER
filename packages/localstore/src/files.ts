import type { Db, DraftRecord, FileRecord, UsageRecord } from './db.ts';

export type NewFile = Omit<FileRecord, 'key' | 'createdAt'>;

/** Images and resume files for a project, kept on this device only. */
export class FileStore {
  constructor(private readonly db: Db) {}

  async put(file: NewFile, now = Date.now()): Promise<FileRecord> {
    const record: FileRecord = { ...file, key: `${file.projectId}/${file.fileId}`, createdAt: now };
    await this.db.put('files', record);
    return record;
  }

  get(projectId: string, fileId: string): Promise<FileRecord | undefined> {
    return this.db.get('files', `${projectId}/${fileId}`);
  }

  list(projectId: string): Promise<FileRecord[]> {
    return this.db.getAllFromIndex('files', 'byProject', projectId);
  }

  async setAlt(projectId: string, fileId: string, alt: string): Promise<void> {
    const r = await this.get(projectId, fileId);
    if (r) await this.db.put('files', { ...r, alt });
  }

  remove(projectId: string, fileId: string): Promise<void> {
    return this.db.delete('files', `${projectId}/${fileId}`);
  }

  async removeProject(projectId: string): Promise<void> {
    const tx = this.db.transaction('files', 'readwrite');
    for (const key of await tx.store.index('byProject').getAllKeys(projectId))
      await tx.store.delete(key);
    await tx.done;
  }

  /** Total bytes stored for a project (shown in the UI). */
  async size(projectId: string): Promise<number> {
    const files = await this.list(projectId);
    return files.reduce(
      (n, f) => n + f.blob.size + Object.values(f.variants ?? {}).reduce((m, b) => m + b.size, 0),
      0,
    );
  }
}

/**
 * Edits saved on this device instantly, before they reach the cloud. A draft is
 * removed once the cloud has the same data.
 */
export class DraftStore {
  constructor(private readonly db: Db) {}

  save(projectId: string, baseRevision: number, data: unknown, now = Date.now()): Promise<string> {
    const record: DraftRecord = {
      projectId,
      baseRevision,
      data: JSON.stringify(data),
      savedAt: now,
    };
    return this.db.put('drafts', record);
  }

  async get(
    projectId: string,
  ): Promise<{ baseRevision: number; data: unknown; savedAt: number } | undefined> {
    const r = await this.db.get('drafts', projectId);
    return r && { baseRevision: r.baseRevision, data: JSON.parse(r.data), savedAt: r.savedAt };
  }

  remove(projectId: string): Promise<void> {
    return this.db.delete('drafts', projectId);
  }
}

/** AI requests and tokens per month, provider and model, counted on this device. */
export class UsageStore {
  constructor(private readonly db: Db) {}

  async record(
    provider: string,
    model: string,
    usage: { inputTokens?: number; outputTokens?: number },
    now = new Date(),
  ): Promise<void> {
    const month = now.toISOString().slice(0, 7);
    const key = `${month}|${provider}|${model}`;
    const tx = this.db.transaction('usage', 'readwrite');
    const prev = await tx.store.get(key);
    await tx.store.put({
      key,
      month,
      provider,
      model,
      requests: (prev?.requests ?? 0) + 1,
      inputTokens: (prev?.inputTokens ?? 0) + (usage.inputTokens ?? 0),
      outputTokens: (prev?.outputTokens ?? 0) + (usage.outputTokens ?? 0),
    });
    await tx.done;
  }

  /** Newest month first. */
  async list(): Promise<UsageRecord[]> {
    const all = await this.db.getAll('usage');
    return all.sort((a, b) => b.month.localeCompare(a.month) || b.requests - a.requests);
  }
}
