import { z } from 'zod';
import { HttpError } from './errors.js';

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw new HttpError(400, 'invalid_input', `${where}${first?.message ?? 'Invalid input'}`);
  }
  return r.data;
}

export const uuid = z.string().uuid();
