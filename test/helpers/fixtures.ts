/** Minimal but genuine file headers, so uploads pass content sniffing. */
const pad = (head: number[]) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);

export const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
export const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
export const TEXT = Buffer.from('plain text attachment\n');
export const HTML = Buffer.from('<html><script>alert(1)</script></html>');
