// The session-bound API of the integrations module for app/: every function is bound to the
// current user here, and only here (Rule 1).
import "server-only";
import { withUser } from "@/lib/auth";
import * as commands from "./commands";
import * as queries from "./queries";

export const getConnections = withUser(queries.getConnections);
export const getProviderChoices = withUser(() => queries.getProviderChoices());
export const searchRecords = withUser(queries.searchRecords);
export const readRecord = withUser(queries.readRecord);

export const connect = withUser(commands.connect);
export const testConnection = withUser(commands.testConnection);
export const disconnect = withUser(commands.disconnect);

export {
  BaseUrlRefused,
  ConnectionNotFound,
  CredentialRejected,
  ProviderNotFound,
  ProviderRateLimited,
  ProviderUnreachable,
} from "./errors";
