import {
  DEMO_PROJECTS,
  DEMO_USERS,
  daysAgo,
  demoId,
  dueDate,
  hoursAgo,
} from './demo-data';

const userKeys = new Set(DEMO_USERS.map((u) => u.key));

describe('demo data', () => {
  it('has unique user keys and e-mails, all on the reserved example.com domain', () => {
    expect(userKeys.size).toBe(DEMO_USERS.length);
    expect(new Set(DEMO_USERS.map((u) => u.email)).size).toBe(
      DEMO_USERS.length,
    );
    for (const user of DEMO_USERS) {
      expect(user.email).toBe(user.email.toLowerCase());
      expect(user.email).toMatch(/@example\.com$/);
      expect(user.name.length).toBeGreaterThanOrEqual(2);
      expect(user.name.length).toBeLessThanOrEqual(100);
    }
  });

  it('has unique project keys and valid project fields', () => {
    expect(new Set(DEMO_PROJECTS.map((p) => p.key)).size).toBe(
      DEMO_PROJECTS.length,
    );
    for (const project of DEMO_PROJECTS) {
      expect(project.name.length).toBeGreaterThanOrEqual(2);
      expect(project.name.length).toBeLessThanOrEqual(100);
      expect(project.description.length).toBeLessThanOrEqual(2000);
    }
  });

  describe.each(DEMO_PROJECTS.map((p) => [p.name, p] as const))(
    '%s',
    (_n, project) => {
      const members = new Map(project.members.map((m) => [m.user, m.role]));

      it('has exactly one owner and no duplicate or unknown members', () => {
        expect(members.size).toBe(project.members.length);
        expect(project.members.filter((m) => m.role === 'OWNER')).toHaveLength(
          1,
        );
        for (const member of project.members) {
          expect(userKeys.has(member.user)).toBe(true);
        }
      });

      it('has unique task keys', () => {
        expect(new Set(project.tasks.map((t) => t.key)).size).toBe(
          project.tasks.length,
        );
      });

      it('only involves project members as creators, assignees and commenters', () => {
        for (const task of project.tasks) {
          expect(members.has(task.createdBy)).toBe(true);
          if (task.assignee) expect(members.has(task.assignee)).toBe(true);
          for (const comment of task.comments ?? []) {
            expect(members.has(comment.by)).toBe(true);
          }
        }
      });

      it('respects the API validation limits', () => {
        for (const task of project.tasks) {
          expect(task.title.length).toBeGreaterThanOrEqual(2);
          expect(task.title.length).toBeLessThanOrEqual(200);
          expect((task.description ?? '').length).toBeLessThanOrEqual(10_000);
          for (const comment of task.comments ?? []) {
            expect(comment.text.length).toBeGreaterThanOrEqual(1);
            expect(comment.text.length).toBeLessThanOrEqual(5000);
          }
        }
      });

      it('has a consistent timeline (nothing happens before it was created)', () => {
        for (const task of project.tasks) {
          expect(task.createdDaysAgo).toBeLessThanOrEqual(
            project.createdDaysAgo,
          );
          expect(task.updatedDaysAgo ?? 0).toBeLessThanOrEqual(
            task.createdDaysAgo,
          );
          for (const comment of task.comments ?? []) {
            expect(comment.hoursAgo).toBeLessThan(task.createdDaysAgo * 24);
          }
        }
      });

      it('does not give finished tasks a due date in the future', () => {
        const doneInFuture = project.tasks.filter(
          (t) => t.status === 'DONE' && (t.dueInDays ?? -1) > 0,
        );
        expect(doneInFuture).toEqual([]);
      });
    },
  );

  it('shows every board column with realistic variety', () => {
    const tasks = DEMO_PROJECTS.flatMap((p) => p.tasks);
    for (const status of [
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
      'DONE',
    ] as const) {
      expect(tasks.some((t) => t.status === status)).toBe(true);
    }
    for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const) {
      expect(tasks.some((t) => t.priority === priority)).toBe(true);
    }
    expect(tasks.some((t) => t.dueInDays === undefined)).toBe(true);
  });

  it('gives the main demo login a full "my tasks" page: overdue, today, soon and later', () => {
    const mine = DEMO_PROJECTS.flatMap((p) => p.tasks).filter(
      (t) => t.assignee === 'alice' && t.status !== 'DONE',
    );
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.some((t) => (t.dueInDays ?? 0) < 0)).toBe(true);
    expect(
      mine.some((t) => (t.dueInDays ?? 99) >= 1 && (t.dueInDays ?? 99) <= 7),
    ).toBe(true);
    expect(mine.some((t) => (t.dueInDays ?? 0) > 7)).toBe(true);
  });
});

describe('demoId', () => {
  it('is deterministic and shaped like a v5 UUID', () => {
    const id = demoId('task', 'website', 'homepage');
    expect(id).toBe(demoId('task', 'website', 'homepage'));
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('gives every task, member and project of the dataset a distinct id', () => {
    const ids: string[] = [];
    for (const project of DEMO_PROJECTS) {
      ids.push(demoId('project', project.key));
      for (const member of project.members) {
        ids.push(demoId('member', project.key, member.user));
      }
      for (const task of project.tasks) {
        ids.push(demoId('task', project.key, task.key));
        (task.comments ?? []).forEach((_c, i) =>
          ids.push(demoId('comment', project.key, task.key, String(i))),
        );
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('date helpers', () => {
  const now = new Date('2026-10-29T10:30:00.000Z');

  it('moves back in time', () => {
    expect(daysAgo(now, 2).toISOString()).toBe('2026-10-27T10:30:00.000Z');
    expect(hoursAgo(now, 5).toISOString()).toBe('2026-10-29T05:30:00.000Z');
  });

  it('puts due dates at 17:00 UTC, before or after today', () => {
    expect(dueDate(now, 0).toISOString()).toBe('2026-10-29T17:00:00.000Z');
    expect(dueDate(now, 3).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(dueDate(now, -2).toISOString()).toBe('2026-10-27T17:00:00.000Z');
  });
});
