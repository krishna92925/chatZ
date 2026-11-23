import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { HttpError } from './errors.js';
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_NAME_LENGTH, MAX_VIDEO_BYTES, MB } from '../../../shared/constants.js';
import type { AttachmentKind } from '../../../shared/types.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'msp', 'dll', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'ps1', 'sh', 'apk', 'jar', 'dmg', 'pkg', 'app', 'lnk', 'reg', 'hta', 'cpl',
]);
const BLOCKED_MIMES = new Set([
  'application/x-msdownload', 'application/x-dosexec', 'application/x-executable', 'application/x-mach-binary', 'application/x-elf', 'application/x-sh', 'application/vnd.microsoft.portable-executable',
]);

export interface Processed {
  buffer: Buffer;
  kind: AttachmentKind;
  mime: string;
  ext: string;
  width: number | null;
  height: number | null;
  name: string;
}

export function cleanFileName(raw: string): string {
  // multer gives latin1 for utf8 names in some clients; recover when it is clearly mis-decoded
  let name = raw;
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD')) name = decoded;
  } catch {
    /* keep */
  }
  name = path.basename(name.replace(/\\/g, '/')).replace(/[<>:"|?*]/g, '').split('').filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('').trim();
  if (!name) name = 'file';
  if (name.length > 120) {
    const ext = path.extname(name).slice(0, 10);
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name;
}

const tooLarge = (limit: number, what: string) =>
  new HttpError(413, 'file_too_large', `${what} must be ${Math.round(limit / MB)} MB or smaller.`);

async function processImage(buf: Buffer, mime: string, name: string, maxSide: number): Promise<Processed> {
  if (mime === 'image/gif') {
    if (buf.length > 10 * MB) throw tooLarge(10 * MB, 'A GIF');
    const meta = await sharp(buf, { animated: true }).metadata();
    return { buffer: buf, kind: 'image', mime, ext: 'gif', width: meta.width ?? null, height: meta.pageHeight ?? meta.height ?? null, name };
  }
  try {
    const { data, info } = await sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, kind: 'image', mime: 'image/webp', ext: 'webp', width: info.width, height: info.height, name: name.replace(/\.[^.]+$/, '') + '.webp' };
  } catch {
    throw new HttpError(400, 'invalid_image', 'That image could not be read. Try a JPEG or PNG.');
  }
}

export async function processUpload(buf: Buffer, originalName: string): Promise<Processed> {
  const name = cleanFileName(originalName);
  const ft = await fileTypeFromBuffer(buf);
  if (ft && IMAGE_MIMES.has(ft.mime)) {
    if (buf.length > MAX_IMAGE_BYTES) throw tooLarge(MAX_IMAGE_BYTES, 'An image');
    return processImage(buf, ft.mime, name, 1920);
  }
  if (ft && VIDEO_MIMES.has(ft.mime)) {
    if (buf.length > MAX_VIDEO_BYTES) throw tooLarge(MAX_VIDEO_BYTES, 'A video');
    return { buffer: buf, kind: 'video', mime: ft.mime, ext: ft.ext, width: null, height: null, name };
  }
  const ext = path.extname(name).slice(1).toLowerCase();
  if (BLOCKED_EXT.has(ext) || (ft && BLOCKED_MIMES.has(ft.mime))) {
    throw new HttpError(400, 'unsupported_file', 'This type of file cannot be sent.');
  }
  if (buf.length > MAX_FILE_BYTES) throw tooLarge(MAX_FILE_BYTES, 'A file');
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : ft?.ext ?? 'bin';
  return { buffer: buf, kind: 'file', mime: ft?.mime ?? 'application/octet-stream', ext: safeExt, width: null, height: null, name };
}

export async function processAvatar(buf: Buffer): Promise<Processed> {
  const ft = await fileTypeFromBuffer(buf);
  if (!ft || !IMAGE_MIMES.has(ft.mime)) throw new HttpError(400, 'invalid_image', 'Choose a JPEG, PNG or WebP image.');
  try {
    const out = await sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize(384, 384, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
    return { buffer: out, kind: 'image', mime: 'image/webp', ext: 'webp', width: 384, height: 384, name: 'avatar.webp' };
  } catch {
    throw new HttpError(400, 'invalid_image', 'That image could not be read.');
  }
}

export { MAX_NAME_LENGTH };
