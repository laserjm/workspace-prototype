import "server-only";
import { bug } from "@/lib/errors";
import type { User } from "@/lib/auth/user";
import { accessFor } from "./access";
import type { RecordPage, RecordQuery, SourceRecord } from "@/modules/sources";
import type {
  ProductPresentation,
  RecordError,
  RecordRead,
  RecordSearchPage,
  RecordSearchQuery,
  SourceRef,
  SourceSummary,
} from "./contracts";
import { err, ok, type Result } from "@/lib/result";
import { findProvider } from "./providers";
import { listConnections, markNeedsReconnect } from "./queries";

/** A source of one of the user's connections, with its product's presentation. */
export type ConnectedSource = {
  connectionId: string;
  summary: SourceSummary;
  presentation: ProductPresentation;
};

/** The records capability of one of the user's connections, or nothing. */
async function recordsOf(user: User, connectionId: string) {
  const connection = (await listConnections(user)).find(
    (item) => item.id === connectionId,
  );
  const records = connection && findProvider(connection.providerId)?.sources;
  const access = records && (await accessFor(user, connection));
  return access && { access, ...records };
}

/** Every source of the user's connections whose provider has records, connection by connection. */
export async function listConnectedSources(
  user: User,
): Promise<ConnectedSource[]> {
  const perConnection = await Promise.all(
    (await listConnections(user)).map(async (connection) => {
      const records = findProvider(connection.providerId)?.sources;
      const access = records && (await accessFor(user, connection));
      if (!records || !access) return [];
      const summaries = await records.reader.listSources(access);
      return summaries.map((summary) => ({
        connectionId: connection.id,
        summary,
        presentation:
          records.products[summary.product] ??
          bug(`provider ${connection.providerId} has no product '${summary.product}'`),
      }));
    }),
  );
  return perConnection.flat();
}

/** A page of one source's records; `undefined` when the user has no such source. */
export async function searchConnectionRecords(
  user: User,
  { connectionId, sourceKey }: SourceRef,
  query: RecordQuery,
): Promise<RecordPage | undefined> {
  const records = await recordsOf(user, connectionId);
  return records?.reader.searchRecords(records.access, sourceKey, query);
}

/** The records with these ids that the source still has, in its order; none for a source the user lacks. */
export async function getConnectionRecords(
  user: User,
  { connectionId, sourceKey }: SourceRef,
  ids: readonly string[],
): Promise<SourceRecord[]> {
  const records = await recordsOf(user, connectionId);
  return records ? records.reader.getRecords(records.access, sourceKey, ids) : [];
}

/** One of the user's connections whose provider holds records, with what reaches it. */
async function recordsConnection(user: User, connectionId: string) {
  const connection = (await listConnections(user)).find(
    (candidate) => candidate.id === connectionId,
  );
  const records = connection && findProvider(connection.providerId)?.records;
  const access = records && (await accessFor(user, connection));
  return records && access ? { records, access } : undefined;
}

/** A refusal to read a record, with the record's page when the provider can say where it is. */
export type RecordReadRefusal = RecordError & { url?: string };

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
  return ok({ summary: { ...summary, url }, detail });
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
