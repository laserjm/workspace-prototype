// The session-bound API of the skills module for app/ (Rule 1). The catalogue has no owner, so
// the user is required but not passed on.
import "server-only";
import { withUser } from "@/lib/auth";
import * as queries from "./queries";

export const getSkills = withUser(() => queries.getSkills());
