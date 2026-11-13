import "server-only";

// Server-only public API of the records module.
export {
  allowedConnections,
  foreignConnectionIds,
  type AllowedConnection,
} from "./queries";
