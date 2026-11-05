// Starter from @conventions/nextjs (binding: next-safe-action) — NX-NSA-01. The project owns this file.
import "server-only";
import { createActionClients } from "@conventions/nextjs/next-safe-action";
import { getRequester } from "@/lib/auth/requester";

export const { actionClient, memberActionClient } = createActionClients({
  getRequester,
});
