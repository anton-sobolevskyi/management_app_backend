import { operationIdFactory } from './swagger.config';

describe('operationIdFactory', () => {
  it.each([
    ['ProjectTasksController', 'findAll', 'tasks-findall'],
    ['TasksController', 'findOne', 'task-findone'],
    ['TaskCommentsController', 'create', 'comments-create'],
    ['CommentsController', 'softDelete', 'comment-softdelete'],
  ])('keeps the pre-rename id for %s.%s', (controller, method, expected) => {
    expect(operationIdFactory(controller, method)).toBe(expected);
  });

  it('derives ids for other controllers as before', () => {
    expect(operationIdFactory('AuthController', 'login')).toBe('auth-login');
    expect(operationIdFactory('ProjectsController', 'findAll')).toBe(
      'projects-findall',
    );
  });
});
