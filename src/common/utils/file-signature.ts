/**
 * Content sniffing for uploads. The multipart Content-Type is chosen by the
 * client, so it proves nothing; the first bytes of the file do.
 */
export const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length &&
  bytes.every((b, i) => buf[offset + i] === b);

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

export function looksLikeText(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** Binary formats we recognise by magic number; null when unknown. */
export function detectBinaryMime(buf: Buffer): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) {
    return 'image/webp';
  }
  // PDF readers accept up to 1 KiB of leading junk before the header
  if (buf.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    return 'application/pdf';
  }
  // OLE2 compound file: legacy .doc (also .xls/.ppt, which share the container)
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return 'application/msword';
  }
  return null;
}

/** Does the content actually look like what the client says it is? */
export function matchesDeclaredType(buf: Buffer, declared: string): boolean {
  if (declared === 'text/plain') return looksLikeText(buf);
  return detectBinaryMime(buf) === declared;
}

/** Keep the user's file name for display, minus path separators and control chars. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return [...cleaned].slice(0, 255).join('') || 'file';
}
