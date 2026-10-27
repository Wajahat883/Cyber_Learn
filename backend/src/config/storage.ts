import { mkdir, readFile, rm, writeFile, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { CopyObjectCommand, CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Private object storage (spec 2 / 8.7). Files are never served directly:
 * the API streams them after checking ownership, so storage stays private.
 */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  ensureReady(): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;

function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.startsWith('/')) throw new Error(`Unsafe storage key: ${key}`);
}

class LocalStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    assertKey(key);
    return path.join(this.root, key);
  }

  async ensureReady() {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Buffer) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    return readFile(this.file(key));
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }

  async copy(fromKey: string, toKey: string) {
    const to = this.file(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(this.file(fromKey), to);
  }

  async exists(key: string) {
    return stat(this.file(key)).then(
      () => true,
      () => false,
    );
  }
}

class S3Storage implements ObjectStorage {
  private readonly client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT || undefined,
    region: env.STORAGE_REGION,
    forcePathStyle: Boolean(env.STORAGE_ENDPOINT),
    credentials:
      env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY
        ? { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY }
        : undefined,
  });

  constructor(private readonly bucket: string) {}

  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      logger.info({ bucket: this.bucket }, 'Creating storage bucket');
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    assertKey(key);
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }

  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async copy(fromKey: string, toKey: string) {
    assertKey(fromKey);
    assertKey(toKey);
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: toKey, CopySource: `${this.bucket}/${fromKey}` }));
  }
}

function createStorage(): ObjectStorage {
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.STORAGE_BUCKET) throw new Error('STORAGE_BUCKET is required when STORAGE_DRIVER=s3');
    return new S3Storage(env.STORAGE_BUCKET);
  }
  return new LocalStorage(path.resolve(env.STORAGE_LOCAL_DIR));
}

export const storage: ObjectStorage = createStorage();
