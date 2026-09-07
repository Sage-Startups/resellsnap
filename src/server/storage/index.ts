/**
 * Object storage.
 *
 * Production uses a private Railway Storage Bucket over the standard
 * S3-compatible SDK: nothing is ever public, and every read or write goes
 * through a short-lived signed URL. A filesystem driver exists purely so local
 * development and CI can run without cloud credentials — it refuses to load in
 * production.
 */
import { randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';

export interface SignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  objectKey: string;
  expiresInSeconds: number;
}

export interface StoredObjectInfo {
  objectKey: string;
  byteSize: number;
  contentType: string | null;
}

export interface StorageDriver {
  readonly name: string;
  createSignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload>;
  createSignedDownload(objectKey: string, expiresInSeconds?: number, filename?: string): Promise<string>;
  putObject(objectKey: string, body: Buffer, contentType: string): Promise<void>;
  getObject(objectKey: string): Promise<Buffer>;
  head(objectKey: string): Promise<StoredObjectInfo | null>;
  deleteObject(objectKey: string): Promise<void>;
  deleteObjects(objectKeys: string[]): Promise<void>;
  listByPrefix(prefix: string, limit?: number): Promise<StoredObjectInfo[]>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

// --- Object key construction ----------------------------------------------
// Keys are ALWAYS built here from server-known values. A client-supplied key is
// never used, and `assertKeyInWorkspace` re-checks ownership on every signed
// download so a leaked key from another tenant is useless.

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

export function buildPhotoKey(workspaceId: string, itemId: string, extension: string): string {
  const random = randomBytes(12).toString('hex');
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'bin';
  return `workspaces/${workspaceId}/items/${itemId}/photos/${random}.${ext}`;
}

export function buildDerivativeKey(originalKey: string, variant: 'thumb' | 'web'): string {
  const dot = originalKey.lastIndexOf('.');
  const base = dot === -1 ? originalKey : originalKey.slice(0, dot);
  return `${base}.${variant}.webp`;
}

export function buildExportKey(workspaceId: string, exportJobId: string, filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'export.bin';
  return `workspaces/${workspaceId}/exports/${exportJobId}/${safe}`;
}

export function workspaceIdFromKey(objectKey: string): string | null {
  const match = /^workspaces\/([A-Za-z0-9_-]+)\//.exec(objectKey);
  return match?.[1] ?? null;
}

/** Throws unless the key demonstrably belongs to the given workspace. */
export function assertKeyInWorkspace(objectKey: string, workspaceId: string): void {
  if (objectKey.includes('..') || objectKey.startsWith('/')) {
    throw new Error('Invalid object key');
  }
  for (const segment of objectKey.split('/')) {
    if (!SAFE_SEGMENT.test(segment)) throw new Error('Invalid object key segment');
  }
  if (workspaceIdFromKey(objectKey) !== workspaceId) {
    throw new Error('Object key does not belong to this workspace');
  }
}

// --- S3 driver -------------------------------------------------------------

class S3Driver implements StorageDriver {
  readonly name = 's3';
  #client: S3Client | null = null;

  #s3(): S3Client {
    if (this.#client) return this.#client;
    const env = getEnv();
    this.#client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      },
    });
    return this.#client;
  }

  #bucket(): string {
    const bucket = getEnv().S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET is not configured');
    return bucket;
  }

  async createSignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload> {
    const expiresIn = input.expiresInSeconds ?? 600;
    const command = new PutObjectCommand({
      Bucket: this.#bucket(),
      Key: input.objectKey,
      ContentType: input.contentType,
      // Signing the length pins the upload size: a client cannot substitute a
      // 5GB file for the 4MB one it declared.
      ContentLength: input.maxBytes,
    });

    const url = await getSignedUrl(this.#s3(), command, {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.maxBytes) },
      objectKey: input.objectKey,
      expiresInSeconds: expiresIn,
    };
  }

  async createSignedDownload(objectKey: string, expiresInSeconds = 300, filename?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.#bucket(),
      Key: objectKey,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"` }
        : {}),
    });
    return getSignedUrl(this.#s3(), command, { expiresIn: expiresInSeconds });
  }

  async putObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.#s3().send(
      new PutObjectCommand({ Bucket: this.#bucket(), Key: objectKey, Body: body, ContentType: contentType }),
    );
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const response = await this.#s3().send(
      new GetObjectCommand({ Bucket: this.#bucket(), Key: objectKey }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object ${objectKey} has no body`);
    return Buffer.from(bytes);
  }

  async head(objectKey: string): Promise<StoredObjectInfo | null> {
    try {
      const response = await this.#s3().send(
        new HeadObjectCommand({ Bucket: this.#bucket(), Key: objectKey }),
      );
      return {
        objectKey,
        byteSize: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.#s3().send(new DeleteObjectCommand({ Bucket: this.#bucket(), Key: objectKey }));
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    if (objectKeys.length === 0) return;
    for (let index = 0; index < objectKeys.length; index += 1000) {
      const chunk = objectKeys.slice(index, index + 1000);
      await this.#s3().send(
        new DeleteObjectsCommand({
          Bucket: this.#bucket(),
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        }),
      );
    }
  }

  async listByPrefix(prefix: string, limit = 1000): Promise<StoredObjectInfo[]> {
    const response = await this.#s3().send(
      new ListObjectsV2Command({ Bucket: this.#bucket(), Prefix: prefix, MaxKeys: limit }),
    );
    return (response.Contents ?? []).map((entry) => ({
      objectKey: entry.Key ?? '',
      byteSize: entry.Size ?? 0,
      contentType: null,
    }));
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.#s3().send(new ListObjectsV2Command({ Bucket: this.#bucket(), MaxKeys: 1 }));
      return { ok: true, detail: `Bucket ${this.#bucket()} reachable` };
    } catch (error) {
      return { ok: false, detail: sanitizeError(error, 'Bucket unreachable') };
    }
  }
}

// --- Local filesystem driver (development and CI only) ---------------------

class LocalDriver implements StorageDriver {
  readonly name = 'local';

  #root(): string {
    return getEnv().LOCAL_STORAGE_DIR;
  }

  async #path(objectKey: string): Promise<string> {
    const path = await import('node:path');
    const root = path.resolve(this.#root());
    const full = path.resolve(root, objectKey);
    // Defence in depth against traversal even though keys are server-built.
    if (!full.startsWith(root + path.sep)) throw new Error('Invalid object key');
    return full;
  }

  async createSignedUpload(input: {
    objectKey: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload> {
    // Uploads are proxied through our own route in local mode; the "signature"
    // is the app session, which is sufficient for development.
    return {
      url: `/api/uploads/local?key=${encodeURIComponent(input.objectKey)}`,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      objectKey: input.objectKey,
      expiresInSeconds: input.expiresInSeconds ?? 600,
    };
  }

  async createSignedDownload(objectKey: string, _expiresInSeconds = 300, filename?: string): Promise<string> {
    const suffix = filename ? `&filename=${encodeURIComponent(filename)}` : '';
    return `/api/uploads/local?key=${encodeURIComponent(objectKey)}${suffix}`;
  }

  async putObject(objectKey: string, body: Buffer, _contentType: string): Promise<void> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const full = await this.#path(objectKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const { readFile } = await import('node:fs/promises');
    return readFile(await this.#path(objectKey));
  }

  async head(objectKey: string): Promise<StoredObjectInfo | null> {
    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(await this.#path(objectKey));
      return { objectKey, byteSize: stats.size, contentType: null };
    } catch {
      return null;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(await this.#path(objectKey));
    } catch {
      // Deleting an object that is already gone is not an error.
    }
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    await Promise.all(objectKeys.map((key) => this.deleteObject(key)));
  }

  async listByPrefix(prefix: string, limit = 1000): Promise<StoredObjectInfo[]> {
    const { readdir, stat } = await import('node:fs/promises');
    const path = await import('node:path');
    const root = path.resolve(this.#root());
    const out: StoredObjectInfo[] = [];

    const walk = async (dir: string): Promise<void> => {
      if (out.length >= limit) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= limit) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          const key = path.relative(root, full).split(path.sep).join('/');
          if (key.startsWith(prefix)) {
            const stats = await stat(full);
            out.push({ objectKey: key, byteSize: stats.size, contentType: null });
          }
        }
      }
    };

    await walk(root);
    return out;
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(this.#root(), { recursive: true });
      return { ok: true, detail: `Local storage at ${this.#root()} (development only)` };
    } catch (error) {
      return { ok: false, detail: sanitizeError(error, 'Local storage unavailable') };
    }
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = getEnv();

  if (env.STORAGE_DRIVER === 'local') {
    if (env.isProduction) {
      throw new Error('The local storage driver cannot be used in production. Set STORAGE_DRIVER=s3.');
    }
    logger.warn('Using local filesystem storage driver (development only)');
    driver = new LocalDriver();
  } else {
    driver = new S3Driver();
  }

  return driver;
}

export function setStorageDriverForTests(next: StorageDriver | null): void {
  driver = next;
}
