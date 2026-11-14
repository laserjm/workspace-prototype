// The session-bound API of the agent module for app/ (Rule 1). The model allowlist has no owner,
// so the user is required but not passed on. Answers run through the threads module, which calls
// commands.ts with the requester it acts for.
import "server-only";
import { withUser } from "@/lib/auth";
import * as queries from "./queries";

export const getModelChoices = withUser(() => queries.getModelChoices());
