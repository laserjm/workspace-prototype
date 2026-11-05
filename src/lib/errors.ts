// The errors more than one module answers with. Same shapes as `@conventions/nextjs/core`'s, so
// either can be returned while the app moves off the package (ARCHITECTURE.md, "Runtime
// helpers from @conventions/nextjs").

/** A constraint refused the write: a unique key, a check, a foreign key. */
export type Conflict = { readonly _tag: "Conflict"; readonly constraint: string };

export const conflict = (constraint: string): Conflict => ({
  _tag: "Conflict",
  constraint,
});

/** The thing asked for does not exist, or is another owner's (the two read the same). */
export type NotFound = {
  readonly _tag: "NotFound";
  readonly entity: string;
  readonly id?: string;
};

export const notFound = (entity: string, id?: string): NotFound => ({
  _tag: "NotFound",
  entity,
  ...(id === undefined ? {} : { id }),
});

/** The input did not match the action's schema. `path` is dotted: `change.until`. */
export type ValidationFailed = {
  readonly _tag: "ValidationFailed";
  readonly issues: ReadonlyArray<{ path: string; message: string }>;
};

/** No signed-in user: the session ended or never existed. */
export type SignedOut = { readonly _tag: "SignedOut" };

/** Something threw on the server. It was logged under `traceId`; the caller learns nothing else. */
export type Unexpected = { readonly _tag: "Unexpected"; readonly traceId: string };

/**
 * Thrown by a repository when a constraint refused the write; the command turns it into a
 * `Conflict`. Catch the class the repository throws: until every module imports this one,
 * modules on `@conventions/nextjs/core` throw that package's class instead.
 */
export class ConstraintViolation extends Error {
  constructor(
    readonly constraint: string,
    entity: string,
  ) {
    super(`${entity}: constraint ${constraint} violated`);
    this.name = "ConstraintViolation";
  }
}
