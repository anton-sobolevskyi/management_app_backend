import { Test, TestingModule } from '@nestjs/testing';
import { S3Service, contentDisposition } from './s3.service';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mockClient } from 'aws-sdk-client-mock';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('S3Service', () => {
  let service: S3Service;
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
    jest.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_S3_ENDPOINT = 'http://localhost:4566';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_S3_BUCKET = 'test-bucket';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [S3Service],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload a file and return the key and bucket', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const buffer = Buffer.from('test');
      const result = await service.uploadFile(buffer, 'text/plain', 'uploads');

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^uploads\/[0-9a-f-]{36}\.txt$/);
      expect(result.bucket).toBe('test-bucket');
      expect(s3Mock.commandCalls(PutObjectCommand).length).toBe(1);
    });

    it('derives the key extension from the MIME type, never from user input', async () => {
      s3Mock.on(PutObjectCommand).resolves({});

      const png = await service.uploadFile(Buffer.from('x'), 'image/png', 'f');
      const unknown = await service.uploadFile(
        Buffer.from('x'),
        'application/x-weird',
        'f',
      );

      expect(png.key).toMatch(/\.png$/);
      expect(unknown.key).toMatch(/\.bin$/);
      expect(
        s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.ContentType,
      ).toBe('image/png');
    });
  });

  describe('deleteObject', () => {
    it('should delete an object', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});

      await service.deleteObject('test-bucket', 'test-key');

      expect(s3Mock.commandCalls(DeleteObjectCommand).length).toBe(1);
      const call = s3Mock.commandCalls(DeleteObjectCommand)[0];
      expect(call.args[0].input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-key',
      });
    });
  });

  describe('getPresignedUrl', () => {
    it('should return a presigned URL', async () => {
      const expectedUrl = 'https://test-url.com';
      (getSignedUrl as jest.Mock).mockResolvedValue(expectedUrl);

      const url = await service.getPresignedUrl(
        'test-bucket',
        'test-key',
        3600,
      );

      expect(url).toBe(expectedUrl);
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('forces a download with the original file name by default', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://x');

      await service.getPresignedUrl('b', 'k', 60, { fileName: 'report.pdf' });

      const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
      expect(command.input.ResponseContentDisposition).toBe(
        `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
      );
    });

    it('can render images inline', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://x');

      await service.getPresignedUrl('b', 'k', 60, {
        fileName: 'a.png',
        inline: true,
      });

      const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
      expect(command.input.ResponseContentDisposition).toMatch(/^inline;/);
    });

    it('sets no disposition when no file name is given', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://x');
      await service.getPresignedUrl('b', 'k');
      const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
      expect(command.input.ResponseContentDisposition).toBeUndefined();
    });
  });

  describe('contentDisposition', () => {
    it('keeps non-ASCII names via filename* with an ASCII fallback', () => {
      const header = contentDisposition('attachment', 'звіт.pdf');
      expect(header).toBe(
        `attachment; filename="____.pdf"; filename*=UTF-8''%D0%B7%D0%B2%D1%96%D1%82.pdf`,
      );
    });

    it('cannot be broken out of by quotes or header-injection characters', () => {
      const header = contentDisposition('attachment', 'a"b\\c\r\nX: y.txt');
      expect(header).not.toMatch(/[\r\n]/);
      expect(header.match(/filename="([^"]*)"/)?.[1]).toBe('a_b_c__X: y.txt');
    });
  });
});
