"use server";
// The HTTP edge: validate, call the command with the signed-in requester.

import { memberActionClient } from "@/lib/safe-action";
import { createProject } from "./commands";
import { createProjectInputSchema } from "./contracts";

export const createProjectAction = memberActionClient
  .inputSchema(createProjectInputSchema)
  .action(async ({ parsedInput, ctx: { requester } }) =>
    createProject(requester, parsedInput),
  );
