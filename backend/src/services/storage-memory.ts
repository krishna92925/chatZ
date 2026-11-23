import { Readable } from 'node:stream';
import type { Storage, StoredObject } from './storage.js';

/** In-memory storage for tests and local experiments. */
export class MemoryStorage implements Storage {
  enabled = true;
  objects = new Map<string, { body: Buffer; type: string }>();

  async put(key: string, body: Buffer, type: string) {
    this.objects.set(key, { body, type });
  }

  async get(key: string, range?: string): Promise<StoredObject> {
    const o = this.objects.get(key);
    if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m?.[1] ? Number(m[1]) : 0;
      const end = m?.[2] ? Math.min(Number(m[2]), o.body.length - 1) : o.body.length - 1;
      const slice = o.body.subarray(start, end + 1);
      return { body: Readable.from(slice), contentType: o.type, contentLength: slice.length, contentRange: `bytes ${start}-${end}/${o.body.length}`, status: 206 };
    }
    return { body: Readable.from(o.body), contentType: o.type, contentLength: o.body.length, status: 200 };
  }

  async delete(keys: string[]) {
    for (const k of keys) this.objects.delete(k);
  }

  async presignGet(key: string) {
    return `https://storage.test/${key}?signed=1`;
  }
}
