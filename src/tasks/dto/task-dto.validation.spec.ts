import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TaskQueryDto } from './task-query.dto';
import { CreateTaskDto } from './create-task.dto';
import { UpdateTaskDto } from './update-task.dto';

const errorsFor = async <T extends object>(cls: new () => T, plain: object) =>
  (
    await validate(plainToInstance(cls, plain), {
      whitelist: true,
    })
  ).map((e) => e.property);

describe('TaskQueryDto', () => {
  it('accepts valid filters and pagination from a query string', async () => {
    expect(
      await errorsFor(TaskQueryDto, {
        page: '2',
        limit: '10',
        status: 'DONE',
        assignedToId: '3f6c1c0e-8c1a-4d7e-9a53-0a5f2f6a9b11',
        q: 'login',
        dueBefore: '2026-10-31',
        dueAfter: '2026-10-01T00:00:00Z',
      }),
    ).toEqual([]);
  });

  it.each([
    ['status', 'NOT_A_STATUS'],
    ['assignedToId', 'not-a-uuid'],
    ['dueBefore', 'tomorrow'],
    ['dueAfter', '2026-02-31'],
    ['q', 'x'.repeat(101)],
  ])(
    'rejects an invalid %s (would otherwise reach Prisma as a 500)',
    async (field, value) => {
      expect(await errorsFor(TaskQueryDto, { [field]: value })).toContain(
        field,
      );
    },
  );
});

describe('dueDate on create/update', () => {
  it.each(['2026-10-31', '2026-10-31T17:00:00Z', '2026-10-31T17:00:00+02:00'])(
    'accepts %s',
    async (dueDate) => {
      expect(
        await errorsFor(CreateTaskDto, { title: 'Task', dueDate }),
      ).toEqual([]);
    },
  );

  it.each(['2026-02-31', 'next friday', '2026-10-31T25:00:00Z'])(
    'rejects %s',
    async (dueDate) => {
      expect(
        await errorsFor(CreateTaskDto, { title: 'Task', dueDate }),
      ).toContain('dueDate');
    },
  );

  it('accepts null on update so the due date can be cleared', async () => {
    expect(await errorsFor(UpdateTaskDto, { dueDate: null })).toEqual([]);
    expect(await errorsFor(UpdateTaskDto, { assignedToId: null })).toEqual([]);
  });
});
