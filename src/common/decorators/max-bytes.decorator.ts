import { ValidationOptions, registerDecorator } from 'class-validator';

/**
 * Maximum UTF-8 size of a string. bcrypt ignores everything past 72 bytes, so
 * `@MaxLength(72)` (characters) is not enough for non-ASCII passwords.
 */
export function MaxBytes(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxBytes',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be at most ${max} bytes`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
      },
    });
  };
}
