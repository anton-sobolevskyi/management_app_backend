export interface CreateAttachmentInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  s3Bucket: string;
  type: 'FILE' | 'IMAGE';
  uploadedById: string;
  taskId?: string;
  commentId?: string;
}
