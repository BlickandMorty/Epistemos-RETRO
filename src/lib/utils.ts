import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Compile-time exhaustiveness check for discriminated union switches.
 * Use in the `default` case — if a variant is unhandled, TS errors because
 * `value` won't narrow to `never`.
 *
 * @example
 * switch (event.type) {
 *   case 'a': …
 *   case 'b': …
 *   default: assertUnreachable(event.type);
 * }
 */
export function assertUnreachable(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}
