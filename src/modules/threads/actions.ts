"use server";
// The HTTP edge: `action` signs the caller in and validates the input, then the command runs.

import { action } from "@/lib/actions/server";
import { forkThread, placeThread, startThread } from "./commands";
import {
  forkThreadInputSchema,
  placeThreadInputSchema,
  startThreadInputSchema,
} from "./contracts";

export const startThreadAction = action(
  startThreadInputSchema,
  (input, { requester }) => startThread(requester, input),
);

export const forkThreadAction = action(
  forkThreadInputSchema,
  (input, { requester }) => forkThread(requester, input),
);

export const placeThreadAction = action(
  placeThreadInputSchema,
  (input, { requester }) => placeThread(requester, input),
);
