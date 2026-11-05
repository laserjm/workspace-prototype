import "server-only";
import { sampleSourceCatalog } from "./catalog";
import {
  findSource,
  recordsIn,
  type RecordScope,
  type Source,
  type SourceRecord,
} from "./contracts";

/** Every source a thread can draw records from. Shared data: no user. */
export async function listSources(): Promise<Source[]> {
  return sampleSourceCatalog;
}

/** The records a scope names that still exist, in the source's order; none for an unknown source. */
export async function listScopedRecords(
  scope: RecordScope,
): Promise<SourceRecord[]> {
  const source = findSource(await listSources(), scope.sourceId);
  return source ? recordsIn(source, scope.recordIds) : [];
}
