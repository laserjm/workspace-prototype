"use server";
// The HTTP edge: validate, call the command with the signed-in requester.

import { memberActionClient } from "@/lib/safe-action";
import { forkThread, startThread } from "./commands";
import { forkThreadInputSchema, startThreadInputSchema } from "./contracts";

export const startThreadAction = memberActionClient
  .inputSchema(startThreadInputSchema)
  .action(async ({ parsedInput, ctx: { requester } }) =>
    startThread(requester, parsedInput),
  );

export const forkThreadAction = memberActionClient
  .inputSchema(forkThreadInputSchema)
  .action(async ({ parsedInput, ctx: { requester } }) =>
    forkThread(requester, parsedInput),
  );
