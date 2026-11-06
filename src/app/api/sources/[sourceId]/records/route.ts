import { getUser } from "@/lib/auth/session";
import { recordQuerySchema } from "@/modules/sources";
import { searchSourceRecords } from "@/modules/sources/server";

/**
 * A page of one of the user's sources' records, read with their connection: what the source
 * explorer and the scope dialog show. `?text=` searches, `?cursor=` asks for the next page.
 */
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/sources/[sourceId]/records">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const query = recordQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!query.success)
    return Response.json({ error: "Invalid record query." }, { status: 400 });
  const { sourceId } = await ctx.params;
  const page = await searchSourceRecords(user, sourceId, query.data);
  if (!page)
    return Response.json({ error: "No such source." }, { status: 404 });
  return Response.json(page, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
