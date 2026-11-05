import "server-only";
import type { Source } from "./domain/source";
import { sampleSourceCatalog } from "./infra/sample.source-catalog";

/** Every source a thread can draw records from. Shared data: no user. */
export async function listSources(): Promise<Source[]> {
  return sampleSourceCatalog;
}
