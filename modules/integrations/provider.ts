import "server-only";
// The provider SPI (docs/adr/0002, 0003, 0006): what a provider folder in ./providers/ declares and
// gets. A provider answers a remote refusal as a value (`Answer`), never by throwing: the model
// and the browser read it as data.
import type {
  AuthMethod,
  BaseUrlSetting,
  Credential,
  RecordError,
  RecordFilter,
  RecordSearchHint,
  RecordSearchPage,
  RecordSearchQuery,
  RecordSummary,
  RecordTypeDeclaration,
} from "./contracts";

/** A provider's answer: the value, or why the remote system refused. */
export type Answer<T, E = RecordError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}

/**
 * What a provider's code gets to reach its system: the API address and the `Authorization` header
 * value, built per request on the server from the vault. A provider never reads a secret, an env
 * var or the database itself.
 */
export type ProviderAccess = { baseUrl: string; authorization?: string };

/** `ProviderAccess` for one stored connection. */
export type ConnectionAccess = ProviderAccess & { connectionId: string };

/** The `Authorization` header value a credential is sent as. */
export function authorizationOf(credential: Credential): string {
  if (credential.kind === "token") return `Bearer ${credential.token}`;
  const pair = `${credential.username}:${credential.password}`;
  const bytes = new TextEncoder().encode(pair);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

/** Who a credential belongs to, as its provider answered. */
export type VerifiedAccount = {
  /** The provider's stable id for the account, e.g. GitHub's numeric user id. */
  accountRef: string;
  /** "@micha", "ana@acme.com". */
  accountLabel: string;
  scopes: string[];
  /** When the credential stops working, if the provider says. */
  expiresAt?: Date;
};

/** Why a provider did not verify a credential. The command turns it into an error class. */
export type VerifyRefusal =
  | { kind: "credential_rejected" }
  | { kind: "rate_limited"; retryAt: string }
  /** `status`: what the provider answered with, when it answered. */
  | { kind: "unreachable"; status?: number };

/**
 * A system the workspace can connect to. Code, not rows: one folder in ./providers/ and one line
 * in ../providers.ts. Capabilities are optional, so a provider has records, tools or both.
 */
export type Provider = {
  id: string;
  name: string;
  description: string;
  auth: readonly AuthMethod[];
  /** Where its API lives; asked for when connecting. */
  baseUrl: BaseUrlSetting;
  /** Checks a credential and says whose it is. */
  verify: (
    access: ProviderAccess,
  ) => Promise<Answer<VerifiedAccount, VerifyRefusal>>;
  /** The records a user can find and attach to a question (ADR 0003 §3). */
  records?: ProviderRecords;
  /**
   * What the agent should know to use one of its connections: what its records and states mean
   * and how its search reads. Markdown imported as text (`guide.md`), in the system prompt while
   * one of its connections is allowed. Server-only: never on `ProviderChoice`.
   */
  guide?: string;
};

/**
 * One record as its view shows it: the live summary, and the provider's own detail (such as
 * `GithubIssueDetail`), which only that provider's view reads. There is no generic detail type.
 */
export type RecordDetail = { summary: RecordSummary; detail: unknown };

/** A declared record type with its readers: server-side, never on `ProviderChoice`. */
export type RecordType = RecordTypeDeclaration & {
  /** Reads one record by its key, which only this provider parses; never throws. */
  read: (access: ConnectionAccess, key: string) => Promise<Answer<RecordDetail, RecordError>>;
  /**
   * Reads one record as `read` does, with its detail trimmed for the model (`read_record`) within
   * `MODEL_LIMITS`, every cut saying what it cut.
   */
  readForModel: (
    access: ConnectionAccess,
    key: string,
  ) => Promise<Answer<RecordDetail, RecordError>>;
};

/**
 * How much of a record the model reads (`read_record`): each provider trims its own detail with
 * these, next to its readers. The view shows everything it read.
 */
export const MODEL_LIMITS = {
  /** A record's body (an issue's description): its first characters. */
  bodyCharacters: 8_000,
  /** A list of comments (or reviews): its newest entries. */
  comments: 30,
  /** Each kept comment: its first characters. */
  commentCharacters: 2_000,
  /** Each changed file's diff (a provider tool's, such as GitHub's): its first characters. */
  diffFileCharacters: 4_000,
  /** All the diffs of one answer; the files past it are listed without theirs. */
  diffCharacters: 40_000,
} as const;

/**
 * `text` cut to its first `max` characters, ending with what was cut and where the rest is:
 * `[… 32,000 more characters, open the view]`. A character is never split in two.
 */
export function cutText(text: string, max: number, rest = "open the view"): string {
  if (text.length <= max) return text;
  const lead = text.charCodeAt(max - 1);
  const end = lead >= 0xd800 && lead <= 0xdbff ? max - 1 : max;
  const more = (text.length - end).toLocaleString("en-US");
  return `${text.slice(0, end)}\n\n[… ${more} more characters, ${rest}]`;
}

/**
 * What a trimmed list left out: `+ 12 older comments`, and `+ 50 later comments not read, open
 * the view` when the reader read fewer than there are. Nothing when nothing was left out.
 */
export function cutNote(noun: string, older: number, unread: number): string | undefined {
  const notes = [
    ...(older > 0 ? [`+ ${older} older ${noun}`] : []),
    ...(unread > 0 ? [`+ ${unread} later ${noun} not read, open the view`] : []),
  ];
  return notes.length ? notes.join(", ") : undefined;
}

/**
 * The newest `MODEL_LIMITS.comments` entries of a list as read (oldest first), of `total` there
 * are, and the `cutNote` of what was left out.
 */
export function newestEntries<T>(
  read: readonly T[],
  total: number,
  noun: string,
): { kept: T[]; note?: string } {
  const kept = read.slice(-MODEL_LIMITS.comments);
  const note = cutNote(noun, read.length - kept.length, total - read.length);
  return note ? { kept, note } : { kept };
}

/**
 * A record type from its declaration, its reader and the trim of what that reader answers, so the
 * trim is typed against the reader's own detail.
 */
export function recordType<D>(
  declaration: RecordTypeDeclaration,
  read: (
    access: ConnectionAccess,
    key: string,
  ) => Promise<Answer<{ summary: RecordSummary; detail: D }, RecordError>>,
  trim: (detail: D) => unknown,
): RecordType {
  return {
    ...declaration,
    read,
    // `trim` only ever gets what `read` answered, so its detail stays a `D`.
    readForModel: async (access, key) => {
      const answer = await read(access, key);
      return answer.ok
        ? ok({ summary: answer.value.summary, detail: trim(answer.value.detail) })
        : answer;
    },
  };
}

/** The records part of a provider's manifest. */
export type ProviderRecords = {
  types: Readonly<Record<string, RecordType>>;
  filters: readonly RecordFilter[];
  hint: RecordSearchHint;
  search: (
    access: ConnectionAccess,
    query: RecordSearchQuery,
  ) => Promise<Answer<RecordSearchPage, RecordError>>;
  /**
   * Where a record is on the provider's site, built from the connection's base URL and the key
   * without asking the provider; nothing for a key it cannot parse.
   */
  url: (baseUrl: string, type: string, key: string) => string | undefined;
};

/** Declares a provider; only checks it against the contract. */
export function defineProvider<const P extends Provider>(provider: P): P {
  return provider;
}
