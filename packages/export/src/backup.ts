import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/**
 * Project backup: one .zip with the project (content, design, code) and the images
 * and resume kept on this device, so a project can move to another computer.
 */
export interface BackupFile {
  fileId: string;
  kind: string;
  mediaType: string;
  name?: string;
  alt?: string;
  width?: number;
  height?: number;
  data: Uint8Array;
  variants?: Record<number, Uint8Array>;
}

export interface Backup {
  /** The project document's editable fields (name, profileType, content, spec, …). */
  project: Record<string, unknown>;
  files: BackupFile[];
  createdAt: number;
}

const FORMAT = 'portfolio-builder-backup';

export class BackupError extends Error {}

export function createBackup(b: Backup): Uint8Array {
  const z: Zippable = {};
  const meta = b.files.map((f) => {
    const variants = Object.keys(f.variants ?? {}).map(Number);
    z[`files/${f.fileId}`] = [f.data, { level: 0 }];
    for (const w of variants) z[`files/${f.fileId}@${w}`] = [f.variants![w]!, { level: 0 }];
    const { fileId, kind, mediaType, name, alt, width, height } = f;
    return { fileId, kind, mediaType, name, alt, width, height, variants };
  });
  z['backup.json'] = strToU8(
    JSON.stringify({
      format: FORMAT,
      version: 1,
      createdAt: b.createdAt,
      project: b.project,
      files: meta,
    }),
  );
  return zipSync(z, { level: 6 });
}

export function readBackup(bytes: Uint8Array): Backup {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new BackupError("This file isn't a portfolio backup (it couldn't be opened).");
  }
  const raw = entries['backup.json'];
  if (!raw) throw new BackupError("This file isn't a portfolio backup.");
  const j = JSON.parse(strFromU8(raw)) as {
    format?: string;
    version?: number;
    createdAt?: number;
    project?: Record<string, unknown>;
    files?: (Omit<BackupFile, 'data' | 'variants'> & { variants?: number[] })[];
  };
  if (j.format !== FORMAT || !j.project)
    throw new BackupError("This file isn't a portfolio backup.");
  if ((j.version ?? 0) > 1)
    throw new BackupError(
      'This backup was made by a newer version of the app. Reload the app and try again.',
    );
  const files: BackupFile[] = [];
  for (const { variants: widths, ...f } of j.files ?? []) {
    const data = entries[`files/${f.fileId}`];
    if (!data || !/^[\w.-]{1,128}$/.test(f.fileId)) continue;
    const variants: Record<number, Uint8Array> = {};
    for (const w of widths ?? []) {
      const v = entries[`files/${f.fileId}@${w}`];
      if (v) variants[w] = v;
    }
    files.push({ ...f, data, ...(Object.keys(variants).length ? { variants } : {}) } as BackupFile);
  }
  return { project: j.project, files, createdAt: j.createdAt ?? 0 };
}
