import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { searchRecords } from "@/modules/integrations/server";
import { recordErrorResponse } from "./record-error";

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
 * `{ results, next?, total?, reach? }`, or a `RecordError` (`record-error.ts`).
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/connections/[connectionId]/records">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!query.success)
    return recordErrorResponse({ kind: "invalid_query", message: "That search is not valid." });
  const { q, type, closed, cursor } = query.data;
  const { connectionId } = await ctx.params;
  const page = await searchRecords(user, connectionId, {
    ...(q?.trim() ? { text: q.trim() } : {}),
    ...(type ? { type } : {}),
    includeClosed: closed === "1",
    ...(cursor ? { cursor } : {}),
  });
  if (!page.ok) return recordErrorResponse(page.error);
  return Response.json(page.value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
