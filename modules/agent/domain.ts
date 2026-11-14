import "server-only";
// The agent's rules, pure: what one answer runs with, resolved from the ids the browser sent, and
// the prompt it is given. The prompt's fixed text is Markdown (./instructions/), imported as text.
import type { User } from "@/lib/auth";
import type { AllowedConnection } from "@/modules/records/contracts";
import type { SkillDetail } from "@/modules/skills/contracts";
import type { AgentModel, ChatOptions } from "./contracts";
import { ModelNotFound, SkillNotFound } from "./errors";
import attachedItems from "./instructions/attached-items.md";
import formatting from "./instructions/formatting.md";
import workspace from "./instructions/workspace.md";

/** What one answer runs with: who asks, the model, the skills and the connections it may use. */
export type AgentContext = {
  /** The requester the answer is for; tools read only what is theirs. */
  user: User;
  model: AgentModel;
  /** The skill the user picked for this message: its instructions are in the prompt. */
  skill?: SkillDetail;
  /** The other skills switched on in this browser: the agent may load one (`load_skill`). */
  offeredSkills: SkillDetail[];
  /**
   * The connections the answer may use, decided by the server from what the thread's questions
   * attached. Left out when the thread attached nothing; empty when none of it is usable.
   */
  connections?: AllowedConnection[];
};

export type Catalogs = {
  models: readonly AgentModel[];
  skills: readonly SkillDetail[];
};

/**
 * Resolves the ids the browser sent against the server's catalogues, so the prompt only ever
 * holds what the server offers. An unknown model or skill id throws.
 */
export function resolveContext(
  user: User,
  options: ChatOptions,
  { models, skills }: Catalogs,
): AgentContext {
  const model = models.find((item) => item.id === options.modelId);
  if (!model) throw new ModelNotFound(options.modelId);

  const skill = options.skillId
    ? skills.find((item) => item.id === options.skillId)
    : undefined;
  if (options.skillId && !skill) throw new SkillNotFound(options.skillId);

  // A stale id from browser storage is no reason to refuse the message: it is left out.
  const switchedOn = options.skillIds ?? [];
  const offeredSkills = skills.filter(
    (item) => switchedOn.includes(item.id) && item.id !== skill?.id,
  );

  return { user, model, skill, offeredSkills };
}

/** Who the agent is and how it answers, then how it formats a reply. Edit the .md files. */
export const baseInstructions = [workspace, formatting]
  .map((text) => text.trim())
  .join("\n\n");

/** The skills the agent may load, by name and description only: their text comes on demand. */
function skillList(skills: readonly SkillDetail[]) {
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
