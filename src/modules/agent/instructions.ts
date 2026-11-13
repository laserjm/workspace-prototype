import "server-only";
import type { AllowedConnection } from "@/modules/records/server";
import type { Skill } from "@/modules/skills";
import type { AgentContext } from "./context";
import attachedItems from "./instructions/attached-items.md";
import formatting from "./instructions/formatting.md";
import workspace from "./instructions/workspace.md";

/** Who the agent is and how it answers, then how it formats a reply. Edit the .md files. */
export const baseInstructions = [workspace, formatting]
  .map((text) => text.trim())
  .join("\n\n");

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

/** One allowed connection's line. Every value is the server's, never the browser's. */
function connectionLine({ connectionId, providerName, provider, account, reach }: AllowedConnection) {
  const line = `- connectionId ${connectionId}: ${providerName} (${provider}), account ${JSON.stringify(account)}`;
  return reach ? `${line}, reaching ${reach}` : line;
}

/**
 * What the agent knows of attached items: the fixed paragraph, the connections it may use and
 * each of their providers' guides, once per provider. Only server-written text.
 */
function connectionsContext(connections: readonly AllowedConnection[]) {
  // By provider id: two connections of one provider share its guide.
  const guides = new Map<string, { name: string; guide: string }>();
  for (const { provider, providerName, guide } of connections)
    if (guide && !guides.has(provider)) guides.set(provider, { name: providerName, guide });
  return [
    "# Attached items and connections",
    attachedItems.trim(),
    "## Connections you may use",
    connections.length > 0
      ? connections.map(connectionLine).join("\n")
      : "None. The connections this thread attached were removed or need reconnecting in Settings.",
    ...[...guides.values()].map(({ name, guide }) => `## ${name}\n\n${guide}`),
  ].join("\n\n");
}

/**
 * Base instructions, then the selected skill, the skills to load, then the connections the thread
 * attached.
 */
export function instructionsFor({
  skill,
  offeredSkills,
  connections,
}: AgentContext) {
  return [
    baseInstructions,
    skill && `# Skill: ${skill.name}\n\n${skill.instructions}`,
    offeredSkills.length > 0 && skillList(offeredSkills),
    connections && connectionsContext(connections),
  ]
    .filter(Boolean)
    .join("\n\n");
}
