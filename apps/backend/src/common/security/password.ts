import { Matches, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 12;
export const BCRYPT_ROUNDS = 12;

/** At least 12 characters with upper, lower, and a digit. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

export function PasswordPolicy(): PropertyDecorator {
  return (target, propertyKey) => {
    MinLength(PASSWORD_MIN_LENGTH)(target, propertyKey);
    Matches(PASSWORD_PATTERN, {
      message:
        'Password must be at least 12 characters and include uppercase, lowercase, and a number',
    })(target, propertyKey);
  };
}
