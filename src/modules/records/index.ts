// Browser-safe public API of the records module: attaching records to a question (ADR 0003).
export type {
  AttachedConnection,
  AttachedItem,
  ConnectionRef,
  ItemSnapshot,
} from "./contracts";
export {
  attachedPhrase,
  itemCount,
  MAX_ATTACHED_CONNECTIONS,
  MAX_ATTACHED_ITEMS,
  removeConnection,
  removeItem,
} from "./contracts";
export {
  ATTACHED_ITEMS_PART,
  attachedByQuestion,
  attachedConnectionsOf,
  attachedItemsText,
  recordsDataSchemas,
  threadAttachedItems,
  type AttachedItemsData,
  type MessageWithParts,
  type RecordsDataTypes,
  type ThreadAttachedItem,
} from "./attached-items";
export { AttachDialog } from "./components/attach-dialog";
export { AttachedItemChip } from "./components/attached-item-chip";
export type { OpenView, PanelState, ViewTarget } from "./record-panel";
export { RecordPanel, RecordPanelToggle } from "./components/record-panel";
export { RecordPanelProvider, useRecordPanel } from "./components/record-panel-provider";
