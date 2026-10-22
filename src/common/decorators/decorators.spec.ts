import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CurrentUser } from './current-user.decorator';
import { MaxBytes } from './max-bytes.decorator';
import { NormalizeEmail } from './normalize-email.decorator';

/** Pull the factory out of a createParamDecorator and call it. */
function runCurrentUser(field: 'userId' | 'email' | undefined, user: unknown) {
  class Host {
    handler(@CurrentUser(field as any) _v: unknown) {}
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Host, 'handler');
  const factory = Object.values<any>(meta)[0].factory;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return factory(field, ctx);
}

describe('CurrentUser', () => {
  const user = { userId: 'u1', email: 'a@b.c' };

  it('returns the whole user, or a single field', () => {
    expect(runCurrentUser(undefined, user)).toEqual(user);
    expect(runCurrentUser('userId', user)).toBe('u1');
    expect(runCurrentUser('email', user)).toBe('a@b.c');
  });

  it('throws 401 when nobody is authenticated', () => {
    expect(() => runCurrentUser('userId', undefined)).toThrow(
      UnauthorizedException,
    );
  });
});

describe('NormalizeEmail', () => {
  class Dto {
    @NormalizeEmail() email: string;
  }
  it('trims and lower-cases strings and leaves other types alone', () => {
    expect(plainToInstance(Dto, { email: '  Mixed@Case.COM ' }).email).toBe(
      'mixed@case.com',
    );
    expect(plainToInstance(Dto, { email: 42 }).email).toBe(42);
  });
});

describe('MaxBytes', () => {
  class Dto {
    @MaxBytes(10) value: string;
  }
  const errors = async (value: unknown) =>
    (await validate(plainToInstance(Dto, { value }))).length;

  it('counts UTF-8 bytes, not characters', async () => {
    expect(await errors('a'.repeat(10))).toBe(0);
    expect(await errors('a'.repeat(11))).toBe(1);
    expect(await errors('їїїїї')).toBe(0); // 5 chars, 10 bytes
    expect(await errors('їїїїїї')).toBe(1); // 6 chars, 12 bytes
    expect(await errors(123)).toBe(1);
  });
});
