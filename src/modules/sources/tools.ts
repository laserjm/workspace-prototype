import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { User } from "@/lib/auth/user";
import {
  recordScopeSchema,
  searchRecords,
  searchRecordsInputSchema,
  searchRecordsOutputSchema,
} from "./contracts";
import { listScopedRecords } from "./queries";

/**
 * The agent's way into this module, beside its pages: thin wrappers over `queries.ts`. A tool's
 * context is what the agent knows of the thread; here, the user and the records it attached, read
 * through the user's connection. Keys are the names the model sees and stored conversations
 * hold, so a tool is never renamed.
 */
export const sourceTools = {
  search_records: tool({
    description:
      "Search the records attached to this thread by status, priority, owner or words. Answers with the matching records' id, title, status, priority, owner and last update. Only the attached records are searched; use the record ids to cite them.",
    inputSchema: searchRecordsInputSchema,
    outputSchema: searchRecordsOutputSchema,
    contextSchema: z.object({
      user: z.custom<User>().optional(),
      scope: recordScopeSchema.optional(),
    }),
    // The user and scope come from the server, never from the model: a record outside the
    // scope, or outside the user's connections, is never read.
    async execute(input, { context }) {
      if (!context.user || !context.scope)
        throw new Error("No records are attached to this thread.");
      return searchRecords(
        await listScopedRecords(context.user, context.scope),
        input,
      );
    },
  }),
};
