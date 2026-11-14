// The session-bound API of the projects module for app/: every function is bound to the current
// user here, and only here (Rule 1).
import "server-only";
import { withUser } from "@/lib/auth";
import * as commands from "./commands";
import * as queries from "./queries";

export const getProjects = withUser(queries.getProjects);
export const createProject = withUser(commands.createProject);
