/**
 * Swagger operationIds are derived from controller class names, and generated
 * API clients depend on them. When controllers were renamed for clarity, these
 * entries keep the ids they had before (e.g. "tasks-findall"), so clients
 * generated from the OpenAPI document don't break.
 */
const LEGACY_CONTROLLER_PREFIX: Record<string, string> = {
  ProjectTasksController: 'tasks',
  TasksController: 'task',
  TaskCommentsController: 'comments',
  CommentsController: 'comment',
};

export function operationIdFactory(
  controllerKey: string,
  methodKey: string,
): string {
  const prefix =
    LEGACY_CONTROLLER_PREFIX[controllerKey] ??
    controllerKey.toLocaleLowerCase().replace('controller', '');
  return `${prefix}-${methodKey.toLocaleLowerCase()}`;
}
