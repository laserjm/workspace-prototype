import "server-only";
import type { User } from "@/lib/auth/user";
import type { RecordPage, RecordQuery } from "@/modules/integrations";
import {
  getConnectionRecords,
  listConnectedSources,
  searchConnectionRecords,
  type ConnectedSource,
} from "@/modules/integrations/server";
import {
  sourceIdOf,
  sourceRefOf,
  type RecordScope,
  type Source,
  type SourceRecord,
} from "./contracts";

function toSource({
  connectionId,
  summary,
  presentation,
}: ConnectedSource): Source {
  return {
    id: sourceIdOf({ connectionId, sourceKey: summary.key }),
    connectionId,
    name: summary.name,
    description: summary.description,
    workspace: summary.workspace,
    location: summary.location,
    collection: summary.collection,
    collectionPath: summary.collectionPath,
    overviewTitle: summary.overviewTitle,
    ...presentation,
  };
}

/** Every source the user's connections offer a thread, without their records. */
export async function listSources(user: User): Promise<Source[]> {
  return (await listConnectedSources(user)).map(toSource);
}

/** A page of a source's records; `undefined` when the user has no such source. */
export async function searchSourceRecords(
  user: User,
  sourceId: string,
  query: RecordQuery,
): Promise<RecordPage | undefined> {
  const ref = sourceRefOf(sourceId);
  return ref ? searchConnectionRecords(user, ref, query) : undefined;
}

/** The records a scope names that still exist, in the source's order; none for an unknown source. */
export async function listScopedRecords(
  user: User,
  scope: RecordScope,
): Promise<SourceRecord[]> {
  const ref = sourceRefOf(scope.sourceId);
  return ref ? getConnectionRecords(user, ref, scope.recordIds) : [];
}
