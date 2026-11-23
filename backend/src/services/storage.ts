import type { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config.js';

export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  status: 200 | 206;
}

export interface Storage {
  enabled: boolean;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string, range?: string): Promise<StoredObject>;
  delete(keys: string[]): Promise<void>;
  presignGet(key: string, expiresSeconds: number, fileName?: string, mime?: string): Promise<string>;
}

export class DisabledStorage implements Storage {
  enabled = false;
  async put(): Promise<void> {
    throw new Error('storage disabled');
  }
  async get(): Promise<StoredObject> {
    throw new Error('storage disabled');
  }
  async delete(): Promise<void> {
    /* nothing stored */
  }
  async presignGet(): Promise<string> {
    throw new Error('storage disabled');
  }
}

export class S3Storage implements Storage {
  enabled = true;
  private client: S3Client;
  private bucket: string;

  constructor(cfg: Config) {
    this.bucket = cfg.S3_BUCKET!;
    this.client = new S3Client({
      region: cfg.AWS_REGION,
      endpoint: cfg.AWS_ENDPOINT_URL_S3,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: cfg.AWS_ACCESS_KEY_ID!, secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY! },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));
  }

  async get(key: string, range?: string): Promise<StoredObject> {
    const out: GetObjectCommandOutput = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }));
    return {
      body: out.Body as Readable,
      contentType: out.ContentType,
      contentLength: out.ContentLength,
      contentRange: out.ContentRange,
      status: range && out.ContentRange ? 206 : 200,
    };
  }

  async delete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
    }
  }

  async presignGet(key: string, expiresSeconds: number, fileName?: string, mime?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: fileName ? `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` : undefined,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresSeconds });
  }
}

export function createStorage(cfg: Config): Storage {
  return cfg.storageEnabled ? new S3Storage(cfg) : new DisabledStorage();
}
