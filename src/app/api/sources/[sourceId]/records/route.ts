import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { recordQuerySchema, type RecordPage } from "@/modules/sources";
import {
  listScopedRecords,
  searchSourceRecords,
} from "@/modules/sources/server";

/** `?id=#42&id=#43`: as many as a thread's scope may hold. */
const idsSchema = z.array(z.string().min(1).max(100)).max(100);

/**
 * One of the user's sources' records, read with their connection. With `?id=` (repeated), the
 * records with those ids that still exist: what the explorer and the context card show of a
 * thread. Without, a page: what the scope dialog lists; `?text=` searches, `?cursor=` asks for the
 * next page. A system that fails answers 502.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/sources/[sourceId]/records">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const ids = idsSchema.safeParse(params.getAll("id"));
  const query = recordQuerySchema.safeParse({
    text: params.get("text") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
  });
  if (!ids.success || !query.success)
    return Response.json({ error: "Invalid record query." }, { status: 400 });
  const { sourceId } = await ctx.params;

  let page: RecordPage | undefined;
  try {
    page = ids.data.length
      ? {
          records: await listScopedRecords(user, {
            sourceId,
            recordIds: ids.data,
          }),
        }
      : await searchSourceRecords(user, sourceId, query.data);
  } catch (error) {
    console.error(`[records] ${sourceId} could not be read`, error);
    return Response.json(
      { error: "The source's system could not be read." },
      { status: 502 },
    );
  }
  if (!page)
    return Response.json({ error: "No such source." }, { status: 404 });
  return Response.json(page, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
