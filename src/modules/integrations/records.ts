import "server-only";
import { bug } from "@conventions/nextjs/core";
import type { User } from "@/lib/auth/user";
import type {
  Connection,
  ConnectionAccess,
  ExternalRecord,
  ProductPresentation,
  RecordPage,
  RecordQuery,
  SourceRef,
  SourceSummary,
} from "./contracts";
import { findProvider } from "./providers";
import { listConnections } from "./queries";

/** A source of one of the user's connections, with its product's presentation. */
export type ConnectedSource = {
  connectionId: string;
  summary: SourceSummary;
  presentation: ProductPresentation;
};

/** What a connection's provider code is given; phase 2 fills it from the vault. */
const accessFor = (connection: Connection): ConnectionAccess => ({
  connectionId: connection.id,
});

/** The records capability of one of the user's connections, or nothing. */
async function recordsOf(user: User, connectionId: string) {
  const connection = (await listConnections(user)).find(
    (item) => item.id === connectionId,
  );
  const records = connection && findProvider(connection.providerId)?.records;
  return records && { access: accessFor(connection), ...records };
}

/** Every source of the user's connections whose provider has records, connection by connection. */
export async function listConnectedSources(
  user: User,
): Promise<ConnectedSource[]> {
  const perConnection = await Promise.all(
    (await listConnections(user)).map(async (connection) => {
      const records = findProvider(connection.providerId)?.records;
      if (!records) return [];
      const summaries = await records.reader.listSources(accessFor(connection));
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
): Promise<ExternalRecord[]> {
  const records = await recordsOf(user, connectionId);
  return records ? records.reader.getRecords(records.access, sourceKey, ids) : [];
}
