import "server-only";
import { recordCountLabel, type SourceRecord } from "@/modules/sources";
import type { AgentContext, AttachedRecords } from "./context";
import formatting from "./instructions/formatting.md";
import workspace from "./instructions/workspace.md";

/** Who the agent is and how it answers, then how it formats a reply. Edit the .md files. */
export const baseInstructions = [workspace, formatting]
  .map((text) => text.trim())
  .join("\n\n");

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

/** The prompt context for a thread's records. Record content always comes from the server. */
function sourceContext({ source, records, recordCount }: AttachedRecords) {
  return [
    `# Source records`,
    `The user attached ${recordCountLabel(source, recordCount)} from ${source.name} (${source.workspace}, ${source.collection}). This is a read-only sample snapshot.`,
    ...records.map(formatRecord),
  ].join("\n\n");
}

/** Base instructions, then the selected skill, then the attached records. */
export function instructionsFor({ skill, attached }: AgentContext) {
  return [
    baseInstructions,
    skill && `# Skill: ${skill.name}\n\n${skill.instructions}`,
    attached && sourceContext(attached),
  ]
    .filter(Boolean)
    .join("\n\n");
}
