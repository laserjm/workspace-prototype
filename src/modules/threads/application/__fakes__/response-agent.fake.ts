import { ok } from "@conventions/nextjs/core";
import type { ResponseAgent, ResponseRequest } from "../ports";

/** Records what it was asked and answers with an empty 200 stream. */
export function inMemoryResponseAgent() {
  const requests: ResponseRequest[] = [];
  const agent: ResponseAgent = {
    async answer(request) {
      requests.push(request);
      return ok(new Response(null, { status: 200 }));
    },
  };
  return { agent, requests };
}
