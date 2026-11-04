import { answerThread } from "@/modules/threads/server";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

export async function POST(req: Request) {
  return answerThread(await req.json().catch(() => undefined), req.signal);
}
