import { getRequester } from "@/lib/auth/requester";
import { listThreadMessages } from "@/modules/threads/server";

/** A stored thread's conversation, which the browser loads the first time the thread opens. */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/threads/[id]/messages">,
) {
  const requester = await getRequester();
  if (!requester)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await ctx.params;
  return Response.json(await listThreadMessages(requester, id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
