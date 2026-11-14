import { getUser } from "@/lib/auth/session";
import { answerThread, listThreadMessages } from "@/modules/threads/server";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

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

/** The thread's next message, answered with the response as a stream. */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/threads/[id]/messages">,
) {
  const user = await getUser();
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { id } = await ctx.params;
  return answerThread(
    user,
    id,
    await req.json().catch(() => undefined),
    req.signal,
  );
}
