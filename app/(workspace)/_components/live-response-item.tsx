"use client";

import { findSkill, useSkills } from "./use-skills";
import type { ModelChoice, WorkspaceUIMessage } from "@/modules/agent/contracts";
import {
  hasVisibleParts,
  MessagePartList,
  messageMarkdown,
} from "./message-part-list";
import { awaitsNextStep } from "./reply-progress";
import { ResponseItem } from "./response-item";

/** A model response, or the placeholder while the request is in flight. */
export function LiveResponseItem({
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
    <ResponseItem
      timing={{
        startedAt,
        completedAt: working ? null : (metadata?.completedAt ?? startedAt),
      }}
      continuation={continuation}
      details={details}
      note="Answered through the Vercel AI Gateway."
      streaming={hasVisibleParts(message)}
      waiting={awaitsNextStep(message)}
      copyText={message ? messageMarkdown(message) : ""}
      onFork={onFork}
    >
      {message && <MessagePartList message={message} streaming={working} />}
    </ResponseItem>
  );
}
