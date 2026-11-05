"use server";
// The HTTP edge: validate, call the command with the signed-in requester.

import { memberActionClient } from "@/lib/safe-action";
import { forkThread, placeThread, startThread } from "./commands";
import {
  forkThreadInputSchema,
  placeThreadInputSchema,
  startThreadInputSchema,
} from "./contracts";

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

export const placeThreadAction = memberActionClient
  .inputSchema(placeThreadInputSchema)
  .action(async ({ parsedInput, ctx: { requester } }) =>
    placeThread(requester, parsedInput),
  );
