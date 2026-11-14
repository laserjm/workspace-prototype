// The session-bound API of the threads module for app/: every function is bound to the current
// user here, and only here (Rule 1).
import "server-only";
import { withUser } from "@/lib/auth";
import * as commands from "./commands";
import * as queries from "./queries";

export const getThreads = withUser(queries.getThreads);
export const getThreadMessages = withUser(queries.getThreadMessages);

export const startThread = withUser(commands.startThread);
export const forkThread = withUser(commands.forkThread);
export const placeThread = withUser(commands.placeThread);
export const answerThread = withUser(commands.answerThread);

export {
  ForeignConnectionAttached,
  ProjectNotFound,
  ResponseNotFound,
  SnoozeTimeInPast,
  ThreadIdTaken,
  ThreadNotFound,
} from "./errors";
export { MessagesRejected, ModelNotFound, SkillNotFound } from "@/modules/agent/errors";
