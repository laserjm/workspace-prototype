import "server-only";
import type { User } from "@/lib/auth/user";
import { accessFor } from "./access";
import type {
  RecordError,
  RecordRead,
  RecordReadRefusal,
  RecordSearchPage,
  RecordSearchQuery,
  RecordType,
} from "./contracts";
import { err, ok, type Result } from "@/lib/result";
import { findProvider } from "./providers";
import { listConnections, markNeedsReconnect } from "./queries";

/** One of the user's connections whose provider holds records, with what reaches it. */
async function recordsConnection(user: User, connectionId: string) {
  const connection = (await listConnections(user)).find(
    (candidate) => candidate.id === connectionId,
  );
  const records = connection && findProvider(connection.providerId)?.records;
  const access = records && (await accessFor(user, connection));
  return records && access ? { records, access } : undefined;
}

/**
 * Reads one record of one of the user's connections for its view (ADR 0003 §3): the provider's
 * reader for `type` parses the key. Another user's connection, one whose provider holds no
 * records, or a type it does not declare is `not_found`. A credential the provider refuses marks
 * the connection `needs_reconnect`. The record's page is built from the connection's base URL and
 * the key, so a refusal names it too; a key the provider cannot parse is `not_found`.
 */
export async function readRecord(
  user: User,
  connectionId: string,
  type: string,
  key: string,
): Promise<Result<RecordRead, RecordReadRefusal>> {
  return readWith(user, connectionId, type, key, (detail) => detail);
}

/**
 * Reads one record as `readRecord` does, with the detail trimmed for the model by its type's own
 * `trim` (`read_record`): the trimmed copy is what the agent sees and the conversation stores.
 */
export async function readRecordForModel(
  user: User,
  connectionId: string,
  type: string,
  key: string,
): Promise<Result<RecordRead, RecordReadRefusal>> {
  return readWith(user, connectionId, type, key, (detail, declared) => declared.trim(detail));
}

async function readWith(
  user: User,
  connectionId: string,
  type: string,
  key: string,
  present: (detail: unknown, declared: RecordType) => unknown,
): Promise<Result<RecordRead, RecordReadRefusal>> {
  const found = await recordsConnection(user, connectionId);
  const declared = found && Object.hasOwn(found.records.types, type) ? found.records.types[type] : undefined;
  if (!found || !declared) return err({ kind: "not_found" });
  const url = found.records.url(found.access.baseUrl, type, key);
  // A key the provider cannot parse names nothing.
  if (!url) return err({ kind: "not_found" });
  const read = await declared.read(found.access, key);
  if (!read.ok) {
    if (read.error.kind === "needs_reconnect") await markNeedsReconnect(user, connectionId);
    return err({ ...read.error, url });
  }
  const { summary, detail } = read.value;
  return ok({ summary: { ...summary, url }, detail: present(detail, declared) });
}

/**
 * Searches the records of one of the user's connections (ADR 0003 §3). Another user's connection,
 * or one whose provider holds no records, is `not_found`. A credential the provider refuses marks
 * the connection `needs_reconnect`.
 */
export async function searchRecords(
  user: User,
  connectionId: string,
  query: RecordSearchQuery,
): Promise<Result<RecordSearchPage, RecordError>> {
  const found = await recordsConnection(user, connectionId);
  if (!found) return err({ kind: "not_found" });
  const page = await found.records.search(found.access, query);
  if (!page.ok && page.error.kind === "needs_reconnect")
    await markNeedsReconnect(user, connectionId);
  return page;
}
