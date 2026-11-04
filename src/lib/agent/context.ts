import "server-only";

import {
  getScopedRecords,
  getSource,
  scopeLabel,
  type SourceRecord,
  type SourceScope,
} from "@/lib/workspace/source-data";

function formatRecord(record: SourceRecord) {
  return [
    `### ${record.id}: ${record.title}`,
    `- Type: ${record.type}`,
    `- Status: ${record.status}`,
    `- Priority: ${record.priority}`,
    `- Owner: ${record.owner}`,
    `- Updated: ${record.updated}`,
    `- Description: ${record.description}`,
    record.risk ? `- Recorded risk: ${record.risk}` : "- Recorded risk: none",
    `- Next step: ${record.nextStep}`,
  ].join("\n");
}

/**
 * Builds the prompt context for a thread's selected records. The client sends
 * only the scope ids; record content always comes from the server.
 */
export function buildSourceContext(scope: SourceScope): string | undefined {
  const records = getScopedRecords(scope);
  if (records.length === 0) return undefined;
  const source = getSource(scope.sourceId);
  return [
    `# Source records`,
    `The user attached ${scopeLabel(scope)} from ${source.name} (${source.workspace}, ${source.collection}). This is a read-only sample snapshot.`,
    ...records.map(formatRecord),
  ].join("\n\n");
}
