"use client";

import { findSkill, useSkills } from "@/modules/skills";
import { findSource, recordCountLabel, useSources } from "@/modules/sources";
import type { WorkspaceUIMessage } from "../contracts";
import type { ModelChoice } from "../domain/model-choice";
import type { ThreadScope } from "../domain/thread";
import { hasVisibleParts, MessageParts } from "./message-parts";
import { ResponseTurn } from "./response-turn";

/** A model response, or the placeholder while the request is in flight. */
export function LiveResponse({
  message,
  requestedAt,
  working,
  continuation,
  scope,
  models,
  onFork,
}: {
  message?: WorkspaceUIMessage;
  /** When the user's message was sent; the fallback start time. */
  requestedAt: string;
  working: boolean;
  continuation: boolean;
  scope?: ThreadScope;
  models: ModelChoice[];
  onFork: () => void;
}) {
  const { skills } = useSkills();
  const { sources } = useSources();
  const metadata = message?.metadata;
  const startedAt = metadata?.startedAt ?? requestedAt;
  const model = metadata?.modelId
    ? models.find((item) => item.id === metadata.modelId)
    : undefined;
  const skill = metadata?.skillId
    ? findSkill(skills, metadata.skillId)
    : undefined;
  const source = scope ? findSource(sources, scope.sourceId) : undefined;
  const details = [
    model && { label: "Model", value: model.label },
    skill && { label: "Skill", value: skill.name },
    scope &&
      source && {
        label: "Source",
        value: `${source.name} · ${recordCountLabel(source, scope.recordIds.length)}`,
      },
  ].filter((detail) => !!detail);

  return (
    <ResponseTurn
      timing={{
        startedAt,
        completedAt: working ? null : (metadata?.completedAt ?? startedAt),
      }}
      continuation={continuation}
      details={details}
      note={
        scope
          ? "Answered through the Vercel AI Gateway from the selected read-only records."
          : "Answered through the Vercel AI Gateway."
      }
      preparingLabel={model ? `${model.label} is thinking…` : "Thinking…"}
      streaming={hasVisibleParts(message)}
      onFork={onFork}
    >
      {message && <MessageParts message={message} />}
    </ResponseTurn>
  );
}
