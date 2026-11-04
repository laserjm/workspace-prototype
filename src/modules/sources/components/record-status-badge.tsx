import type { RecordStatus } from "../domain/source";

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return (
    <span
      className={`record-status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}
