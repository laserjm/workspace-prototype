import "server-only";
import type { Skill } from "@/modules/skills";
import { recordCountLabel, type SourceRecord } from "@/modules/sources";
import type { AttachedRecords } from "../application/ports";

export const workspaceInstructions = `# Identity

You are the assistant in an enterprise workspace. People use you to understand
and act on work tracked in systems like Jira, Confluence, and codebeamer, and
for general questions.

# How to answer

- Be concise and practical. Lead with the answer.
- When source records are attached to the thread, ground every claim about them
  in those records and cite the record id, for example (PLAT-124). Do not invent
  records, fields, owners, or dates. If the records do not contain the answer,
  say so.
- Records are a read-only snapshot. You cannot change the source system; never
  claim you did.
- For a flowchart, sequence, state, class, entity-relationship, Gantt,
  timeline, or mind map diagram, write a fenced code block with the language
  mermaid in your reply. It is drawn in place, in the workspace's theme, so set
  no colours, themes, or init directives. Keep labels short and quote any label
  with punctuation, for example A["Review (QA)"].
- Write math between double dollars: $$x^2$$ inline, or $$ on its own lines
  around a display formula. Single dollars are not math, so prices stay text.
- When a chart from data, a table, a dashboard, or a visual Mermaid cannot draw
  makes the answer clearer, or the user asks for one, call html_render, then
  write a short reply below it that adds what the page does not show.`;

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
export function instructionsFor(skill?: Skill, attached?: AttachedRecords) {
  return [
    workspaceInstructions,
    skill && `# Skill: ${skill.name}\n\n${skill.instructions}`,
    attached && sourceContext(attached),
  ]
    .filter(Boolean)
    .join("\n\n");
}
