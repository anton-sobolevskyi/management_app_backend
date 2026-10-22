import {
  detectBinaryMime,
  looksLikeText,
  matchesDeclaredType,
  sanitizeFileName,
  MIME_EXTENSIONS,
} from './file-signature';

const bytes = (...b: number[]) => Buffer.from(b);
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc(16)]);

const PNG = pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPEG = pad(bytes(0xff, 0xd8, 0xff, 0xe0));
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  bytes(0, 0, 0, 0),
  Buffer.from('WEBPVP8 '),
]);
const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ');
const DOC = pad(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1));

describe('file-signature', () => {
  describe('detectBinaryMime', () => {
    it.each([
      ['png', PNG, 'image/png'],
      ['jpeg', JPEG, 'image/jpeg'],
      ['webp', WEBP, 'image/webp'],
      ['pdf', PDF, 'application/pdf'],
      ['legacy doc', DOC, 'application/msword'],
    ])('recognises %s', (_n, buf, mime) => {
      expect(detectBinaryMime(buf)).toBe(mime);
    });

    it('accepts a PDF with leading junk (allowed by readers)', () => {
      expect(
        detectBinaryMime(Buffer.concat([Buffer.from('\n\n  junk\n'), PDF])),
      ).toBe('application/pdf');
    });

    it('does not mistake a RIFF/WAV file for WebP', () => {
      const wav = Buffer.concat([
        Buffer.from('RIFF'),
        bytes(0, 0, 0, 0),
        Buffer.from('WAVEfmt '),
      ]);
      expect(detectBinaryMime(wav)).toBeNull();
    });

    it.each([
      ['html', Buffer.from('<html><body>hi</body></html>')],
      ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      ['exe', pad(bytes(0x4d, 0x5a))],
      ['empty', Buffer.alloc(0)],
    ])('returns null for %s', (_n, buf) => {
      expect(detectBinaryMime(buf)).toBeNull();
    });
  });

  describe('looksLikeText', () => {
    it('accepts UTF-8 including non-Latin text', () => {
      expect(looksLikeText(Buffer.from('Привіт, світе!\n'))).toBe(true);
    });
    it('rejects NUL bytes and invalid UTF-8', () => {
      expect(looksLikeText(Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
      expect(looksLikeText(Buffer.from([0xff, 0xfe, 0xfd]))).toBe(false);
      expect(looksLikeText(PNG)).toBe(false);
    });
  });

  describe('matchesDeclaredType', () => {
    it('requires the bytes to agree with the declared type', () => {
      expect(matchesDeclaredType(PNG, 'image/png')).toBe(true);
      expect(matchesDeclaredType(PNG, 'image/jpeg')).toBe(false);
      expect(matchesDeclaredType(Buffer.from('<script>'), 'image/png')).toBe(
        false,
      );
      expect(matchesDeclaredType(Buffer.from('hello'), 'text/plain')).toBe(
        true,
      );
      expect(matchesDeclaredType(PNG, 'text/plain')).toBe(false);
    });
  });

  describe('sanitizeFileName', () => {
    it.each([
      ['report.pdf', 'report.pdf'],
      ['звіт 2026.pdf', 'звіт 2026.pdf'],
      ['../../etc/passwd', '.._.._etc_passwd'],
      ['a\\b.txt', 'a_b.txt'],
      ['bad\u0000\u001fname.txt', 'badname.txt'],
      ['   ', 'file'],
      ['', 'file'],
    ])('%j -> %j', (input, expected) => {
      expect(sanitizeFileName(input)).toBe(expected);
    });

    it('caps the length without splitting characters', () => {
      const long = sanitizeFileName('є'.repeat(400));
      expect([...long]).toHaveLength(255);
    });
  });

  it('maps every allowed MIME type to an extension', () => {
    expect(Object.values(MIME_EXTENSIONS).sort()).toEqual(
      ['doc', 'jpg', 'pdf', 'png', 'txt', 'webp'].sort(),
    );
  });
});
