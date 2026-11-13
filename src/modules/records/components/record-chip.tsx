"use client";

import { useIntegrations, type RecordSummary } from "@/modules/integrations";
import { connectionRefOf } from "../contracts";
import { AttachedItemChip } from "./attached-item-chip";
import { useRecordPanel } from "./record-panel-provider";

/**
 * A record a tool answered, as a chip that opens its record view (as a view tab, never under
 * Attached). Nothing once its connection is gone. A provider's own tool card draws it through a
 * slot, since `integrations` cannot import this module.
 */
export function RecordChip({ summary }: { summary: RecordSummary }) {
  const { connections } = useIntegrations();
  const panel = useRecordPanel();
  const connection = connections.find((candidate) => candidate.id === summary.connectionId);
  if (!connection) return null;
  const ref = connectionRefOf(connection);
  const item = {
    type: summary.type,
    key: summary.key,
    snapshot: { label: summary.label, title: summary.title, state: summary.state },
  };
  return (
    <AttachedItemChip
      connection={ref}
      item={item}
      onOpen={() => panel.open({ connection: ref, item })}
    />
  );
}
