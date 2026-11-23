export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (code = 'forbidden', message = 'You are not allowed to do that.') => new HttpError(403, code, message);
export const notFound = (code = 'not_found', message = 'Not found.') => new HttpError(404, code, message);
export const conflict = (code: string, message?: string) => new HttpError(409, code, message);
