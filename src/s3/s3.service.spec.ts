import { Test, TestingModule } from '@nestjs/testing';
import { S3Service } from './s3.service';
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
      const result = await service.uploadFile(buffer, 'test.txt', 'text/plain', 'uploads');

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^uploads\/.*\.txt$/);
      expect(result.bucket).toBe('test-bucket');
      expect(s3Mock.commandCalls(PutObjectCommand).length).toBe(1);
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

      const url = await service.getPresignedUrl('test-bucket', 'test-key', 3600);

      expect(url).toBe(expectedUrl);
      expect(getSignedUrl).toHaveBeenCalled();
    });
  });
});
