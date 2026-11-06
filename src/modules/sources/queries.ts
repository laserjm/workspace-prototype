import "server-only";
import type { User } from "@/lib/auth/user";
import {
  findConnectedSource,
  getConnectionComments,
  getConnectionRecords,
  listConnectedSources,
  searchConnectionRecords,
  type ConnectedSource,
} from "@/modules/integrations/server";
import {
  COMMENT_TEXT_LIMIT,
  RECORD_TEXT_LIMIT,
  sourceIdOf,
  sourceRefOf,
  truncate,
  type GetRecordOutput,
  type RecordPage,
  type RecordQuery,
  type RecordScope,
  type Source,
  type SourceRecord,
} from "./contracts";

function toSource({
  connectionId,
  system,
  account,
  live,
  summary,
  presentation,
}: ConnectedSource): Source {
  return {
    id: sourceIdOf({ connectionId, sourceKey: summary.key }),
    connectionId,
    system,
    account,
    availability: live ? "live" : "snapshot",
    name: summary.name,
    description: summary.description,
    workspace: summary.workspace,
    location: summary.location,
    collection: summary.collection,
    collectionPath: summary.collectionPath,
    ...presentation,
  };
}

/** Every source the user's connections offer a thread, without their records. */
export async function listSources(user: User): Promise<Source[]> {
  return (await listConnectedSources(user)).map(toSource);
}

/** One of the user's sources, asking only its connection; none when it is gone. */
export async function findSource(
  user: User,
  sourceId: string,
): Promise<Source | undefined> {
  const ref = sourceRefOf(sourceId);
  const source = ref && (await findConnectedSource(user, ref));
  return source && toSource(source);
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

/**
 * The records a scope names that still exist, in the source's order; none for an unknown source.
 * Read live each time, so they are as fresh as the system. Throws when the system fails.
 */
export async function listScopedRecords(
  user: User,
  scope: RecordScope,
): Promise<SourceRecord[]> {
  const ref = sourceRefOf(scope.sourceId);
  return ref ? getConnectionRecords(user, ref, scope.recordIds) : [];
}

/** One record of the scope in full, with its latest comments; none when it is not in the scope. */
export async function readScopedRecord(
  user: User,
  scope: RecordScope,
  id: string,
): Promise<GetRecordOutput | undefined> {
  const ref = sourceRefOf(scope.sourceId);
  if (!ref || !scope.recordIds.includes(id)) return undefined;
  const [[record], comments] = await Promise.all([
    getConnectionRecords(user, ref, [id]),
    getConnectionComments(user, ref, id),
  ]);
  if (!record) return undefined;
  const { summary, risk, nextStep, description, ...facts } = record;
  // Written for the sample: the agent reads them as fields, beside the system's own.
  const notes = Object.entries({ Summary: summary, Risk: risk, "Next step": nextStep })
    .filter((entry): entry is [string, string] => Boolean(entry[1]));
  const fields = { ...record.fields, ...Object.fromEntries(notes) };
  return {
    ...facts,
    ...(Object.keys(fields).length ? { fields } : {}),
    description: truncate(description, RECORD_TEXT_LIMIT),
    comments: comments.map((comment) => ({
      ...comment,
      body: truncate(comment.body, COMMENT_TEXT_LIMIT),
    })),
  };
}
