import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsIntegerLike(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isIntegerLike',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) {
            return true;
          }

          if (typeof value === 'number') {
            return Number.isInteger(value) && value >= 0;
          }

          return typeof value === 'string' && /^[0-9]+$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a non-negative integer or integer string`;
        },
      },
    });
  };
}
