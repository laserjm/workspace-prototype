// Browser-safe public API of the records module: attaching records to a question (ADR 0003).
export type {
  AttachedConnection,
  AttachedItem,
  ConnectionRef,
  ItemSnapshot,
} from "./contracts";
export {
  itemCount,
  MAX_ATTACHED_CONNECTIONS,
  MAX_ATTACHED_ITEMS,
  removeConnection,
  removeItem,
} from "./contracts";
export { AttachDialog } from "./components/attach-dialog";
export { AttachedItemChip } from "./components/attached-item-chip";
