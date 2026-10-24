import { Prisma } from '../generated/prisma/client';
import { ATTACHMENT_PUBLIC_SELECT } from '../attachments/attachments.constants';
import { USER_PROFILE_SELECT, USER_PUBLIC_SELECT } from '../users/user-select';

/**
 * Drift guard. Most API responses are built from Prisma rows, so a column
 * added to the schema would reach clients unless a `select` allowlist hides
 * it. This forces a decision for every column and model: a new one fails this
 * test until it is classified as exposed (and added to the DTO / select) or
 * hidden.
 */
const columns = (fields: Record<string, string>) => Object.keys(fields);

function expectClassified(
  model: string,
  all: string[],
  exposed: string[],
  hidden: string[],
) {
  const overlap = exposed.filter((f) => hidden.includes(f));
  expect({ model, overlap }).toEqual({ model, overlap: [] });
  expect({ model, classified: [...exposed, ...hidden].sort() }).toEqual({
    model,
    classified: [...all].sort(),
  });
}

describe('exposed fields', () => {
  it('knows every model (a new one needs a review of what it returns)', () => {
    expect(Object.keys(Prisma.ModelName).sort()).toEqual(
      [
        'Attachment',
        'Comment',
        'OneTimeToken',
        'Project',
        'ProjectMember',
        'RefreshToken',
        'Task',
        'User',
      ].sort(),
    );
  });

  it('User: secrets and internal state never leave the database layer', () => {
    expectClassified(
      'User',
      columns(Prisma.UserScalarFieldEnum),
      Object.keys(USER_PROFILE_SELECT),
      ['passwordHash', 'tokenVersion', 'deletedAt', 'updatedAt'],
    );
    // other people see strictly less than the owner does
    expect(Object.keys(USER_PUBLIC_SELECT)).not.toContain('emailVerifiedAt');
  });

  it('Attachment: storage coordinates stay private', () => {
    expectClassified(
      'Attachment',
      columns(Prisma.AttachmentScalarFieldEnum),
      Object.keys(ATTACHMENT_PUBLIC_SELECT),
      ['s3Key', 's3Bucket'],
    );
  });

  // Returned as whole rows: every column is part of the API contract.
  // Adding one here means adding it to the response DTO on purpose.
  it.each([
    [
      'Task',
      Prisma.TaskScalarFieldEnum,
      [
        'id',
        'title',
        'description',
        'status',
        'priority',
        'dueDate',
        'projectId',
        'createdById',
        'assignedToId',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ],
    ],
    [
      'Project',
      Prisma.ProjectScalarFieldEnum,
      ['id', 'name', 'description', 'createdAt', 'updatedAt', 'deletedAt'],
    ],
    [
      'Comment',
      Prisma.CommentScalarFieldEnum,
      [
        'id',
        'content',
        'taskId',
        'authorId',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ],
    ],
    [
      'ProjectMember',
      Prisma.ProjectMemberScalarFieldEnum,
      ['id', 'userId', 'projectId', 'role', 'joinedAt'],
    ],
  ])('%s: every column is intentionally exposed', (model, fields, exposed) => {
    expectClassified(model, columns(fields), exposed, []);
  });
});
