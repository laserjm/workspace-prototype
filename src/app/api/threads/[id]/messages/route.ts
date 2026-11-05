import { getUser } from "@/lib/auth/session";
import { listThreadMessages } from "@/modules/threads/server";

/** A stored thread's conversation, which the browser loads the first time the thread opens. */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/threads/[id]/messages">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await ctx.params;
  return Response.json(await listThreadMessages(user, id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
