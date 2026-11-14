import "server-only";
import * as integrations from "@/modules/integrations";
import { recordErrorResponse, recordResponse, thrownResponse } from "../../record-error";

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
 * Answers `{ summary: RecordSummary & { url }, detail }`, or a refusal with the record's `url`
 * when the provider can say where it is (`record-error.ts`).
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/connections/[connectionId]/records/[type]/[key]">,
) {
  const { connectionId, type, key } = await ctx.params;
  try {
    const read = await integrations.getRecord(connectionId, type, decodedKey(key));
    return read.ok ? recordResponse(read.value) : recordErrorResponse(read.error);
  } catch (error) {
    return thrownResponse(error);
  }
}
