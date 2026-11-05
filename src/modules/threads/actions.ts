"use server";
// The HTTP edge: validate, call the command with the signed-in requester.

import { memberActionClient } from "@/lib/safe-action";
import { startThread } from "./commands";
import { startThreadInputSchema } from "./contracts";

export const startThreadAction = memberActionClient
  .inputSchema(startThreadInputSchema)
  .action(async ({ parsedInput, ctx: { requester } }) =>
    startThread(requester, parsedInput),
  );
