import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectMemberGuard } from './project-member.guard';
import { ProjectScope } from '../decorators/project-scope.decorator';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';

const uuid = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const P1 = uuid(1);
const T1 = uuid(2);
const C1 = uuid(3);
const RID = uuid(4);

describe('ProjectMemberGuard', () => {
  const authz = {
    assertProjectMember: jest.fn(),
    assertTaskAccess: jest.fn(),
    assertCommentAccess: jest.fn(),
    assertAttachmentAccess: jest.fn(),
  };
  const guard = new ProjectMemberGuard(new Reflector(), authz as any);

  function ctx(
    controller: new () => object,
    handler: string,
    req: { user?: { userId: string }; params: Record<string, string> },
  ): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => controller.prototype[handler],
      getClass: () => controller,
    } as unknown as ExecutionContext;
  }

  // Controllers shaped like the real ones
  class MethodScoped {
    @ProjectScope('project', 'id')
    @Roles(Role.OWNER, Role.ADMIN)
    update() {}
  }

  @ProjectScope('task', 'taskId')
  class ClassScoped {
    list() {}
    @ProjectScope('comment', 'commentId')
    override() {}
  }

  class Unscoped {
    handler() {}
  }

  beforeEach(() => jest.clearAllMocks());

  it('rejects unauthenticated requests', async () => {
    await expect(
      guard.canActivate(ctx(MethodScoped, 'update', { params: { id: P1 } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authorizes the project named by the scope, passing @Roles through', async () => {
    const ok = await guard.canActivate(
      ctx(MethodScoped, 'update', {
        user: { userId: 'u1' },
        params: { id: P1 },
      }),
    );
    expect(ok).toBe(true);
    expect(authz.assertProjectMember).toHaveBeenCalledWith('u1', P1, [
      Role.OWNER,
      Role.ADMIN,
    ]);
  });

  it('uses a class-level scope for every handler', async () => {
    await guard.canActivate(
      ctx(ClassScoped, 'list', {
        user: { userId: 'u1' },
        params: { taskId: T1 },
      }),
    );
    expect(authz.assertTaskAccess).toHaveBeenCalledWith('u1', T1, undefined);
  });

  it('lets a method-level scope override the class-level one', async () => {
    await guard.canActivate(
      ctx(ClassScoped, 'override', {
        user: { userId: 'u1' },
        params: { commentId: C1 },
      }),
    );
    expect(authz.assertCommentAccess).toHaveBeenCalledWith('u1', C1, undefined);
    expect(authz.assertTaskAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['attachment', 'assertAttachmentAccess'],
    ['task', 'assertTaskAccess'],
    ['comment', 'assertCommentAccess'],
    ['project', 'assertProjectMember'],
  ] as const)('dispatches %s scopes to %s', async (resource, method) => {
    class C {
      @ProjectScope(resource, 'rid')
      h() {}
    }
    await guard.canActivate(
      ctx(C, 'h', { user: { userId: 'u1' }, params: { rid: RID } }),
    );
    expect(authz[method]).toHaveBeenCalledWith('u1', RID, undefined);
  });

  it('fails closed (500) when a guarded route declares no @ProjectScope', async () => {
    await expect(
      guard.canActivate(
        ctx(Unscoped, 'handler', {
          user: { userId: 'u1' },
          params: { id: P1 },
        }),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(authz.assertProjectMember).not.toHaveBeenCalled();
  });

  it('404s when the scoped route parameter is missing', async () => {
    await expect(
      guard.canActivate(
        ctx(MethodScoped, 'update', { user: { userId: 'u1' }, params: {} }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['p1', "1' OR '1'='1", '../etc/passwd', 'null', ''])(
    'rejects the malformed id %j without any database lookup',
    async (bad) => {
      await expect(
        guard.canActivate(
          ctx(MethodScoped, 'update', {
            user: { userId: 'u1' },
            params: { id: bad },
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authz.assertProjectMember).not.toHaveBeenCalled();
    },
  );

  it('propagates the authorization failure', async () => {
    authz.assertProjectMember.mockRejectedValue(
      new NotFoundException('Project not found'),
    );
    await expect(
      guard.canActivate(
        ctx(MethodScoped, 'update', {
          user: { userId: 'u1' },
          params: { id: P1 },
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
