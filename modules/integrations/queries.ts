import "server-only";
import { asc, eq } from "drizzle-orm";
import type { User } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { connectionsTable } from "@/lib/db/schema";
import type {
  ConnectionListItem,
  ProviderChoice,
  RecordDeclarations,
  RecordRead,
  RecordReadRefusal,
  RecordSearchPage,
  RecordSearchQuery,
} from "./contracts";
import { err, ok, type Answer, type Provider, type ProviderRecords, type RecordType } from "./provider";
import { findProvider, providers } from "./providers";
import { accessFor, connectionColumns, findOwnedConnection, markNeedsReconnect } from "./repo";

/** The requester's connections, in the order they were made. */
export async function getConnections(requester: User): Promise<ConnectionListItem[]> {
  return db()
    .select(connectionColumns)
    .from(connectionsTable)
    .where(eq(connectionsTable.userId, requester.id))
    .orderBy(asc(connectionsTable.createdAt));
}

/** Every provider, as the browser sees it: no code. Shared data, no owner. */
export async function getProviderChoices(): Promise<ProviderChoice[]> {
  return providers.map(({ id, name, description, auth, baseUrl, records }) => ({
    id,
    name,
    description,
    auth,
    baseUrl,
    ...(records ? { records: declarationsOf(records) } : {}),
  }));
}

/** A provider's records as the browser gets them: its types without their readers. */
function declarationsOf({ types, filters, hint }: ProviderRecords): RecordDeclarations {
  return {
    types: Object.fromEntries(
      Object.entries(types).map(([type, { singular, plural, states }]) => [
        type,
        { singular, plural, states },
      ]),
    ),
    filters,
    hint,
  };
}

/** What the agent's prompt says of a provider: its name and its guide, if it has one. */
export async function getProviderForPrompt(
  id: string,
): Promise<Pick<Provider, "name" | "guide"> | null> {
  const provider = findProvider(id);
  return provider ? { name: provider.name, guide: provider.guide?.trim() } : null;
}

/** One of the requester's connections whose provider holds records, with what reaches it. */
async function recordsConnection(requester: User, connectionId: string) {
  const connection = await findOwnedConnection(requester, connectionId);
  const records = connection && findProvider(connection.providerId)?.records;
  const access = records && (await accessFor(requester, connection));
  return records && access ? { records, access } : undefined;
}

/**
 * Reads one record of one of the requester's connections for its view (ADR 0003 §3): the
 * provider's reader for `type` parses the key. Another user's connection, one whose provider
 * holds no records, or a type it does not declare is `not_found`. A credential the provider
 * refuses marks the connection `needs_reconnect`. The record's page is built from the
 * connection's base URL and the key, so a refusal names it too; a key the provider cannot parse
 * is `not_found`. A refusal is a value (docs/adr/0006).
 */
export async function readRecord(
  requester: User,
  connectionId: string,
  type: string,
  key: string,
): Promise<Answer<RecordRead, RecordReadRefusal>> {
  return readWith(requester, connectionId, type, key, (declared) => declared.read);
}

/**
 * Reads one record as `readRecord` does, with the detail trimmed for the model by its type's own
 * `readForModel` (`read_record`): the trimmed copy is what the agent sees and the conversation stores.
 */
export async function readRecordForModel(
  requester: User,
  connectionId: string,
  type: string,
  key: string,
): Promise<Answer<RecordRead, RecordReadRefusal>> {
  return readWith(requester, connectionId, type, key, (declared) => declared.readForModel);
}

async function readWith(
  requester: User,
  connectionId: string,
  type: string,
  key: string,
  readerOf: (declared: RecordType) => RecordType["read"],
): Promise<Answer<RecordRead, RecordReadRefusal>> {
  const found = await recordsConnection(requester, connectionId);
  const declared =
    found && Object.hasOwn(found.records.types, type) ? found.records.types[type] : undefined;
  if (!found || !declared) return err({ kind: "not_found" });
  const url = found.records.url(found.access.baseUrl, type, key);
  // A key the provider cannot parse names nothing.
  if (!url) return err({ kind: "not_found" });
  const read = await readerOf(declared)(found.access, key);
  if (!read.ok) {
    if (read.error.kind === "needs_reconnect") await markNeedsReconnect(requester, connectionId);
    return err({ ...read.error, url });
  }
  const { summary, detail } = read.value;
  return ok({ summary: { ...summary, url }, detail });
}

/**
 * Searches the records of one of the requester's connections (ADR 0003 §3). Another user's
 * connection, or one whose provider holds no records, is `not_found`. A credential the provider
 * refuses marks the connection `needs_reconnect`.
 */
export async function searchRecords(
  requester: User,
  connectionId: string,
  query: RecordSearchQuery,
): Promise<Answer<RecordSearchPage>> {
  const found = await recordsConnection(requester, connectionId);
  if (!found) return err({ kind: "not_found" });
  const page = await found.records.search(found.access, query);
  if (!page.ok && page.error.kind === "needs_reconnect")
    await markNeedsReconnect(requester, connectionId);
  return page;
}
