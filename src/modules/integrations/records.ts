import "server-only";
import { bug } from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import type {
  RecordComment,
  RecordPage,
  RecordQuery,
  SourceRecord,
} from "@/modules/sources";
import { accessFor } from "./access";
import type {
  Connection,
  ConnectionAccess,
  ProductPresentation,
  Provider,
  SourceRef,
  SourceSummary,
} from "./contracts";
import { findProvider } from "./providers";
import { listConnections } from "./queries";

/** A source of one of the user's connections, with its product's presentation. */
export type ConnectedSource = {
  connectionId: string;
  /** The provider's name: "GitHub". */
  system: string;
  /** The connection's account label: "@micha". */
  account: string;
  /** Read from the system with the user's credential, not a bundled snapshot. */
  live: boolean;
  summary: SourceSummary;
  presentation: ProductPresentation;
};

type Records = NonNullable<Provider["records"]>;
type ReadableConnection = {
  connection: Connection;
  provider: Provider;
  records: Records;
  access: ConnectionAccess;
};

/** A connection the user may read records through: active, with records and a credential. */
async function readable(
  user: User,
  connection: Connection,
): Promise<ReadableConnection | undefined> {
  const provider = findProvider(connection.providerId);
  if (connection.status !== "active" || !provider?.records) return undefined;
  const access = await accessFor(user, connection);
  return access && { connection, provider, records: provider.records, access };
}

/** The user's connection with this id, if they may read records through it. */
async function readableById(user: User, connectionId: string) {
  const connection = (await listConnections(user)).find(
    (item) => item.id === connectionId,
  );
  return connection && readable(user, connection);
}

/** One connection's sources; none, logged, when its system fails, so the others still list. */
async function sourcesOf({
  connection,
  provider,
  records,
  access,
}: ReadableConnection): Promise<ConnectedSource[]> {
  let summaries: SourceSummary[];
  try {
    summaries = await records.reader.listSources(access);
  } catch (error) {
    console.error(
      `[integrations] the sources of connection ${connection.id} (${provider.id}) were not listed`,
      error,
    );
    return [];
  }
  return summaries.map((summary) => ({
    connectionId: connection.id,
    system: provider.name,
    account: connection.accountLabel,
    live: !records.snapshot,
    summary,
    presentation:
      records.products[summary.product] ??
      bug(`provider ${provider.id} has no product '${summary.product}'`),
  }));
}

/** Every source of the user's connections whose provider has records, connection by connection. */
export async function listConnectedSources(
  user: User,
): Promise<ConnectedSource[]> {
  const connections = await Promise.all(
    (await listConnections(user)).map((connection) => readable(user, connection)),
  );
  const perConnection = await Promise.all(
    connections.map((connection) => (connection ? sourcesOf(connection) : [])),
  );
  return perConnection.flat();
}

/** One source of the user's, asking only its own connection; none when it is gone. */
export async function findConnectedSource(
  user: User,
  { connectionId, sourceKey }: SourceRef,
): Promise<ConnectedSource | undefined> {
  const connection = await readableById(user, connectionId);
  const sources = connection ? await sourcesOf(connection) : [];
  return sources.find((source) => source.summary.key === sourceKey);
}

/** A page of one source's records; `undefined` when the user has no such source. */
export async function searchConnectionRecords(
  user: User,
  { connectionId, sourceKey }: SourceRef,
  query: RecordQuery,
): Promise<RecordPage | undefined> {
  const connection = await readableById(user, connectionId);
  return connection?.records.reader.searchRecords(
    connection.access,
    sourceKey,
    query,
  );
}

/**
 * The records with these ids that the source still has, in its order; none for a source the user
 * lacks. Throws when the system fails.
 */
export async function getConnectionRecords(
  user: User,
  { connectionId, sourceKey }: SourceRef,
  ids: readonly string[],
): Promise<SourceRecord[]> {
  const connection = await readableById(user, connectionId);
  return connection
    ? connection.records.reader.getRecords(connection.access, sourceKey, ids)
    : [];
}

/** A record's latest comments, oldest first; none when its system keeps none. */
export async function getConnectionComments(
  user: User,
  { connectionId, sourceKey }: SourceRef,
  id: string,
): Promise<RecordComment[]> {
  const connection = await readableById(user, connectionId);
  const reader = connection?.records.reader;
  return connection && reader?.getComments
    ? reader.getComments(connection.access, sourceKey, id)
    : [];
}
