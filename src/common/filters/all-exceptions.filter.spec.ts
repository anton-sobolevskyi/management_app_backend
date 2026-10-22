import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, getHeader: jest.fn() };
  const request = {
    method: 'GET',
    url: '/tasks/1',
    headers: { 'x-request-id': 'req-1' },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function prismaError(code: string) {
  const err = new Error(
    'Invalid `prisma.task.update()` invocation: secret SQL details',
  );
  err.name = 'PrismaClientKnownRequestError';
  Object.assign(err, { code });
  return err;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(filter['logger'], 'error').mockImplementation();
    jest.spyOn(filter['logger'], 'warn').mockImplementation();
  });

  it('keeps HttpException status and message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Task not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Task not found',
        requestId: 'req-1',
        path: '/tasks/1',
      }),
    );
  });

  it('keeps validation message arrays', () => {
    const { host, json } = makeHost();
    filter.catch(new BadRequestException(['a must be x', 'b must be y']), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['a must be x', 'b must be y'] }),
    );
  });

  it('does not leak the message of unexpected errors', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(filter['logger'].error).toHaveBeenCalled();
  });

  it.each([
    ['P2002', 409, 'Resource already exists'],
    ['P2025', 404, 'Resource not found'],
    ['P2003', 409, 'Operation conflicts with related data'],
  ])(
    'maps Prisma %s to %i without exposing driver text',
    (code, httpStatus, message) => {
      const { host, status, json } = makeHost();
      filter.catch(prismaError(code), host);

      expect(status).toHaveBeenCalledWith(httpStatus);
      expect(json.mock.calls[0][0].message).toBe(message);
    },
  );

  it('answers 500 for unmapped Prisma codes', () => {
    const { host, status, json } = makeHost();
    filter.catch(prismaError('P1001'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).toBe('Internal server error');
  });
});
