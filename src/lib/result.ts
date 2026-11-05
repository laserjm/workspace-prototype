// A refusal is a value, not a throw. Same shape as `@conventions/nextjs/core`'s `Result`, so
// modules that still import that package and modules that import this file can call each other
// while the app moves off the package (ARCHITECTURE.md, "Leaving @conventions/nextjs").

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
