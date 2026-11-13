"use client";

import { findSkill, useSkills } from "@/modules/skills";
import type { ModelChoice, WorkspaceUIMessage } from "@/modules/agent";
import {
  hasVisibleParts,
  MessageParts,
  messageMarkdown,
} from "./message-parts";
import { ResponseTurn } from "./response-turn";

/** A model response, or the placeholder while the request is in flight. */
export function LiveResponse({
  message,
  requestedAt,
  working,
  continuation,
  models,
  onFork,
}: {
  message?: WorkspaceUIMessage;
  /** When the user's message was sent; the fallback start time. */
  requestedAt: string;
  working: boolean;
  continuation: boolean;
  models: ModelChoice[];
  onFork: () => void;
}) {
  const { skills } = useSkills();
  const metadata = message?.metadata;
  const startedAt = metadata?.startedAt ?? requestedAt;
  const model = metadata?.modelId
    ? models.find((item) => item.id === metadata.modelId)
    : undefined;
  const skill = metadata?.skillId
    ? findSkill(skills, metadata.skillId)
    : undefined;
  const details = [
    model && { label: "Model", value: model.label },
    skill && { label: "Skill", value: skill.name },
  ].filter((detail) => !!detail);

  return (
    <ResponseTurn
      timing={{
        startedAt,
        completedAt: working ? null : (metadata?.completedAt ?? startedAt),
      }}
      continuation={continuation}
      details={details}
      note="Answered through the Vercel AI Gateway."
      preparingLabel={model ? `${model.label} is thinking…` : "Thinking…"}
      streaming={hasVisibleParts(message)}
      copyText={message ? messageMarkdown(message) : ""}
      onFork={onFork}
    >
      {message && <MessageParts message={message} streaming={working} />}
    </ResponseTurn>
  );
}
