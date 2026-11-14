import { getUser } from "@/lib/auth/session";
import { readRecord } from "@/modules/integrations/server";
import { recordErrorResponse } from "../../record-error";

/** `key` as the browser encoded it, decoded once if the router left it encoded. */
function decodedKey(key: string): string {
  try {
    return /%[0-9a-f]{2}/i.test(key) ? decodeURIComponent(key) : key;
  } catch {
    return key;
  }
}

/**
 * Reads one record of one of the user's connections for its record view. `[type]` is one of the
 * provider's declared types and `[key]` the URL-encoded key, which only the provider parses.
 * Answers `{ summary: RecordSummary & { url }, detail }`, or a `RecordError` with the record's
 * `url` when the provider can say where it is (`record-error.ts`).
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/connections/[connectionId]/records/[type]/[key]">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { connectionId, type, key } = await ctx.params;
  const read = await readRecord(user, connectionId, type, decodedKey(key));
  if (!read.ok) return recordErrorResponse(read.error);
  return Response.json(read.value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
