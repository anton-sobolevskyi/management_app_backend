import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { Role } from '../generated/prisma/enums';
import { AppConfigService } from '../config/app-config.service';
import { AccountRecoveryService } from '../auth/account-recovery.service';
import { PasswordService } from '../auth/password.service';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const mockUserResponse = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    avatarId: null,
    createdAt: new Date(),
  };

  const mockPrisma: any = {
    user: { findFirst: jest.fn(), update: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    },
    task: { updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockProjects = { softDeleteInTx: jest.fn() };
  const mockAttachments = { remove: jest.fn(), purgeObjects: jest.fn() };
  const mockRecovery = { notifyEmailChanged: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProjectsService, useValue: mockProjects },
        { provide: AttachmentsService, useValue: mockAttachments },
        { provide: AccountRecoveryService, useValue: mockRecovery },
        {
          provide: PasswordService,
          useValue: new PasswordService(
            new AppConfigService({ BCRYPT_ROUNDS: '10' }),
          ),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    );
  });

  describe('findOne', () => {
    it('should return user if found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUserResponse);
      expect(await service.findOne('user-1')).toEqual(mockUserResponse);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findOne('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const current = { ...mockUserResponse };

    it('changes the name without asking for the password', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(current);
      mockPrisma.user.update.mockResolvedValue({ ...current, name: 'New' });

      await service.update('user-1', { name: 'New' });

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'New' },
        select: expect.any(Object),
      });
      expect(mockRecovery.notifyEmailChanged).not.toHaveBeenCalled();
    });

    it('treats the same address (any case) as no change: no password, stays verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(current);
      mockPrisma.user.update.mockResolvedValue(current);

      await service.update('user-1', { email: 'Test@Example.com' });

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {},
        select: expect.any(Object),
      });
      expect(mockRecovery.notifyEmailChanged).not.toHaveBeenCalled();
    });

    it('requires the current password to change the e-mail address', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(current);

      await expect(
        service.update('user-1', { email: 'new@example.com' } as any),
      ).rejects.toThrow(/password is required/);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong password and never reveals whether the new address is taken', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(current) // findOne
        .mockResolvedValueOnce({ passwordHash: 'stored-hash' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.update('user-1', {
          email: 'taken@example.com',
          currentPassword: 'wrong',
        } as any),
      ).rejects.toThrow(BadRequestException);

      // only findOne + the password lookup ran: no "is it taken?" query
      expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('normalises the email and rejects one taken by someone else', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(current) // findOne
        .mockResolvedValueOnce({ passwordHash: 'stored-hash' })
        .mockResolvedValueOnce({ id: 'other' }); // taken
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.update('user-1', {
          email: ' Taken@Example.com ',
          currentPassword: 'right-1',
        } as any),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.findFirst).toHaveBeenLastCalledWith({
        where: {
          email: 'taken@example.com',
          deletedAt: null,
          NOT: { id: 'user-1' },
        },
        select: { id: true },
      });
    });

    it('changes the address: unverifies it, drops the password field and notifies', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(current) // findOne
        .mockResolvedValueOnce({ passwordHash: 'stored-hash' })
        .mockResolvedValueOnce(null); // not taken
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({
        ...current,
        email: 'new@example.com',
      });

      await service.update('user-1', {
        email: 'New@Example.com',
        currentPassword: 'right-1',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('right-1', 'stored-hash');
      const { data } = mockPrisma.user.update.mock.calls[0][0];
      expect(data).toEqual({
        email: 'new@example.com',
        emailVerifiedAt: null,
      });
      expect(data).not.toHaveProperty('currentPassword');
      expect(mockRecovery.notifyEmailChanged).toHaveBeenCalledWith(
        'user-1',
        'test@example.com',
        'new@example.com',
      );
    });
  });

  describe('changePassword', () => {
    const dto = { currentPassword: 'old-pass-1', newPassword: 'new-pass-2' };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'stored-hash',
      });
    });

    it('verifies the current password, stores the new hash and revokes all sessions', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      mockPrisma.user.update.mockReturnValue('user-update');
      mockPrisma.refreshToken.updateMany.mockReturnValue('revoke');

      await service.changePassword('user-1', dto);

      expect(bcrypt.compare).toHaveBeenCalledWith('old-pass-1', 'stored-hash');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        // bumping the version kills access tokens that are still unexpired
        data: { passwordHash: 'new-hash', tokenVersion: { increment: 1 } },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
    });

    it('rejects a wrong current password without changing anything', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reusing the same password', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'same-pass-1',
          newPassword: 'same-pass-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    const dto = { currentPassword: 'right-1' };
    const owned = (projectId: string, name: string) => ({
      projectId,
      project: { name },
    });

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        avatarId: null,
      });
      mockPrisma.projectMember.findMany.mockResolvedValue([]);
      mockPrisma.projectMember.groupBy.mockResolvedValue([]);
      mockPrisma.user.update.mockResolvedValue(mockUserResponse);
      mockProjects.softDeleteInTx.mockResolvedValue({ stored: [] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    // groupBy rows: other members of the owned projects, by role
    const others = (
      projectId: string,
      owners: number,
      plainMembers: number,
    ) => [
      ...(owners
        ? [{ projectId, role: Role.OWNER, _count: { _all: owners } }]
        : []),
      ...(plainMembers
        ? [{ projectId, role: Role.MEMBER, _count: { _all: plainMembers } }]
        : []),
    ];

    it('anonymises the account, removes memberships, unassigns tasks and revokes tokens', async () => {
      await service.softDelete('user-1', dto);

      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { assignedToId: 'user-1' },
        data: { assignedToId: null },
      });
      expect(mockPrisma.projectMember.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });

      const { data } = mockPrisma.user.update.mock.calls[0][0];
      expect(data).toMatchObject({
        deletedAt: expect.any(Date),
        email: expect.stringContaining('deleted+user-1'),
        name: 'Deleted user',
        avatarId: null,
      });
      // personal data is erased, and the hash can never match a password
      expect(data.passwordHash).toMatch(/^!/);
    });

    it('refuses while sole OWNER of a project that still has other members', async () => {
      mockPrisma.projectMember.findMany.mockResolvedValue([
        owned('p1', 'Team Alpha'),
      ]);
      mockPrisma.projectMember.groupBy.mockResolvedValue(others('p1', 0, 3));

      const attempt = service.softDelete('user-1', dto);
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toThrow(/Team Alpha/);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
      expect(mockProjects.softDeleteInTx).not.toHaveBeenCalled();
      expect(mockAttachments.purgeObjects).not.toHaveBeenCalled();
    });

    it('allows deletion when another OWNER keeps the project running', async () => {
      mockPrisma.projectMember.findMany.mockResolvedValue([
        owned('p1', 'Shared'),
      ]);
      mockPrisma.projectMember.groupBy.mockResolvedValue([
        ...others('p1', 1, 0),
        ...others('p1', 0, 4),
      ]);

      await service.softDelete('user-1', dto);

      expect(mockProjects.softDeleteInTx).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('deletes solo projects inside the same transaction and purges files after commit', async () => {
      mockPrisma.projectMember.findMany.mockResolvedValue([
        owned('p1', 'Solo'),
      ]);
      const stored = [{ s3Bucket: 'b', s3Key: 'k' }];
      mockProjects.softDeleteInTx.mockResolvedValue({ stored });
      const order: string[] = [];
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const result = await cb(mockPrisma);
        order.push('commit');
        return result;
      });
      mockAttachments.purgeObjects.mockImplementation(async () => {
        order.push('purge');
      });

      await service.softDelete('user-1', dto);

      // same tx client, so a later failure rolls the project delete back too
      expect(mockProjects.softDeleteInTx).toHaveBeenCalledWith(
        mockPrisma,
        'p1',
      );
      expect(mockPrisma.$queryRaw).toHaveBeenCalled(); // project rows locked
      expect(mockAttachments.purgeObjects).toHaveBeenCalledWith(stored);
      expect(order).toEqual(['commit', 'purge']);
    });

    it('does not touch the database transaction twice (single $transaction)', async () => {
      await service.softDelete('user-1', dto);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('removes the avatar file after the account is anonymised', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        avatarId: 'av1',
      });
      mockAttachments.remove.mockResolvedValue({});

      await service.softDelete('user-1', dto);

      expect(mockAttachments.remove).toHaveBeenCalledWith('av1');
    });

    it('requires the current password before touching anything', async () => {
      await expect(service.softDelete('user-1', {} as any)).rejects.toThrow(
        /password is required/,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a wrong password without deleting', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.softDelete('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('404s for an unknown or already deleted user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
