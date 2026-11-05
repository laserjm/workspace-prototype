import "server-only";
import type { Skill } from "@/modules/skills";
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

/** The skills the agent may load, by name and description only: their text comes on demand. */
function skillList(skills: readonly Skill[]) {
  return [
    "# Skills you can load",
    "The user switched these skills on. When a question fits one, call load_skill with its id and follow the instructions it returns. Otherwise answer without one.",
    skills
      .map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`)
      .join("\n"),
  ].join("\n\n");
}

/** Base instructions, then the selected skill, the skills to load, then the attached records. */
export function instructionsFor({
  skill,
  offeredSkills,
  attached,
}: AgentContext) {
  return [
    baseInstructions,
    skill && `# Skill: ${skill.name}\n\n${skill.instructions}`,
    offeredSkills.length > 0 && skillList(offeredSkills),
    attached && sourceContext(attached),
  ]
    .filter(Boolean)
    .join("\n\n");
}
