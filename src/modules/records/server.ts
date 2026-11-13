import "server-only";

// Server-only public API of the records module. The pure attached-item rules are here as well as
// in index.ts, so server code takes them without the browser index's components.
export {
  attachedConnectionsOf,
  attachedItemsText,
  recordsDataSchemas,
} from "./attached-items";
export {
  allowedConnections,
  foreignConnectionIds,
  type AllowedConnection,
} from "./queries";
export { recordTools } from "./tools";
