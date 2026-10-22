import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { Role } from '../../generated/prisma/enums';

describe('AuthorizationService', () => {
  const prisma: any = {
    project: { findFirst: jest.fn() },
    projectMember: { findUnique: jest.fn(), findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    comment: { findFirst: jest.fn() },
    attachment: { findUnique: jest.fn() },
  };
  const service = new AuthorizationService(prisma);

  beforeEach(() => jest.resetAllMocks());

  describe('assertProjectMember', () => {
    it('404s for a deleted/missing project', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.assertProjectMember('u', 'p'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s (not 403) for non-members, so project existence is not leaked', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p' });
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(
        service.assertProjectMember('u', 'p'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403s when the role is not allowed', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });
      await expect(
        service.assertProjectMember('u', 'p', [Role.OWNER, Role.ADMIN]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the membership when allowed', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.ADMIN });
      await expect(
        service.assertProjectMember('u', 'p', [Role.OWNER, Role.ADMIN]),
      ).resolves.toEqual({ role: Role.ADMIN });
    });
  });

  describe('assertTaskAccess', () => {
    it('404s for a deleted task', async () => {
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(service.assertTaskAccess('u', 't')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('delegates to project membership of the task project', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't', projectId: 'p' });
      prisma.project.findFirst.mockResolvedValue({ id: 'p' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });
      await expect(service.assertTaskAccess('u', 't')).resolves.toEqual({
        id: 't',
        projectId: 'p',
      });
      expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: { userId_projectId: { userId: 'u', projectId: 'p' } },
      });
    });
  });

  describe('assertAttachmentAccess', () => {
    const projectAttachment = {
      id: 'a',
      uploadedById: 'uploader',
      taskId: 't',
      commentId: null,
      task: { projectId: 'p' },
      comment: null,
    };
    const avatar = {
      id: 'av',
      uploadedById: 'owner',
      taskId: null,
      commentId: null,
      task: null,
      comment: null,
    };

    it('404s for an unknown attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);
      await expect(
        service.assertAttachmentAccess('u', 'a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires membership of the task project and reports the projectId', async () => {
      prisma.attachment.findUnique.mockResolvedValue(projectAttachment);
      prisma.project.findFirst.mockResolvedValue({ id: 'p' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });

      const result = await service.assertAttachmentAccess('u', 'a');
      expect(result.projectId).toBe('p');
    });

    it('resolves the project through a comment attachment too', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...projectAttachment,
        taskId: null,
        commentId: 'c',
        task: null,
        comment: { task: { projectId: 'p2' } },
      });
      prisma.project.findFirst.mockResolvedValue({ id: 'p2' });
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });

      const result = await service.assertAttachmentAccess('u', 'a');
      expect(result.projectId).toBe('p2');
    });

    it('lets the owner read their own avatar without any project lookup', async () => {
      prisma.attachment.findUnique.mockResolvedValue(avatar);
      await expect(
        service.assertAttachmentAccess('owner', 'av'),
      ).resolves.toMatchObject({
        projectId: undefined,
      });
      expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
    });

    it("lets someone who shares a live project read another user's avatar", async () => {
      prisma.attachment.findUnique.mockResolvedValue(avatar);
      prisma.projectMember.findFirst.mockResolvedValue({ id: 'm' });

      await expect(
        service.assertAttachmentAccess('teammate', 'av'),
      ).resolves.toBeDefined();

      expect(prisma.projectMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'teammate',
          project: { deletedAt: null, members: { some: { userId: 'owner' } } },
        },
        select: { id: true },
      });
    });

    it('404s for a stranger who shares no project with the avatar owner', async () => {
      prisma.attachment.findUnique.mockResolvedValue(avatar);
      prisma.projectMember.findFirst.mockResolvedValue(null);
      await expect(
        service.assertAttachmentAccess('stranger', 'av'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertAttachmentManage', () => {
    it('allows the uploader', async () => {
      await expect(
        service.assertAttachmentManage('u1', {
          uploadedById: 'u1',
          projectId: 'p',
        }),
      ).resolves.toBeUndefined();
      expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    });

    it.each([Role.OWNER, Role.ADMIN])('allows a project %s', async (role) => {
      prisma.projectMember.findUnique.mockResolvedValue({ role });
      await expect(
        service.assertAttachmentManage('boss', {
          uploadedById: 'u1',
          projectId: 'p',
        }),
      ).resolves.toBeUndefined();
    });

    it("forbids a plain MEMBER from touching someone else's attachment", async () => {
      prisma.projectMember.findUnique.mockResolvedValue({ role: Role.MEMBER });
      await expect(
        service.assertAttachmentManage('m', {
          uploadedById: 'u1',
          projectId: 'p',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids everyone but the owner from changing an avatar, even project admins', async () => {
      await expect(
        service.assertAttachmentManage('admin', { uploadedById: 'owner' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assertCommentAuthorOrAdmin', () => {
    const comment = { authorId: 'author', task: { projectId: 'p' } };

    it('allows the author', async () => {
      await expect(
        service.assertCommentAuthorOrAdmin('author', comment),
      ).resolves.toBeUndefined();
    });

    it('allows an admin, forbids a member', async () => {
      prisma.projectMember.findUnique.mockResolvedValueOnce({
        role: Role.ADMIN,
      });
      await expect(
        service.assertCommentAuthorOrAdmin('admin', comment),
      ).resolves.toBeUndefined();

      prisma.projectMember.findUnique.mockResolvedValueOnce({
        role: Role.MEMBER,
      });
      await expect(
        service.assertCommentAuthorOrAdmin('member', comment),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
