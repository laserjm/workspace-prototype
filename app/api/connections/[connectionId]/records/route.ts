import "server-only";
import { z } from "zod";
import * as integrations from "@/modules/integrations";
import { recordErrorResponse, recordResponse, thrownResponse } from "./record-error";

const querySchema = z.object({
  q: z.string().max(256).optional(),
  type: z.string().min(1).max(100).optional(),
  closed: z.enum(["0", "1"]).optional(),
  cursor: z.string().min(1).max(200).optional(),
});

/**
 * Searches one of the user's connections for records to attach: what the attach dialog lists.
 * `?q=` holds the words, `?type=` one declared type, `?closed=1` counts closed records too, and
 * `?cursor=` asks for the page after the one that answered with it. Answers
 * `{ results, next?, total?, reach? }`, or a refusal (`record-error.ts`).
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/connections/[connectionId]/records">,
) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success)
    return recordErrorResponse({ kind: "invalid_query", message: "That search is not valid." });
  const { q, type, closed, cursor } = query.data;
  const { connectionId } = await ctx.params;
  try {
    const page = await integrations.getRecordSearchPage(connectionId, {
      ...(q?.trim() ? { text: q.trim() } : {}),
      ...(type ? { type } : {}),
      includeClosed: closed === "1",
      ...(cursor ? { cursor } : {}),
    });
    return page.ok ? recordResponse(page.value) : recordErrorResponse(page.error);
  } catch (error) {
    return thrownResponse(error);
  }
}
