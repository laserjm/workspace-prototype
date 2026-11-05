import { getRequester } from "@/lib/auth/requester";
import { answerThread } from "@/modules/threads/server";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

export async function POST(req: Request) {
  const requester = await getRequester();
  if (!requester)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return answerThread(
    requester,
    await req.json().catch(() => undefined),
    req.signal,
  );
}
