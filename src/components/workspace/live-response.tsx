"use client";

import { hasVisibleParts, MessageParts } from "@/components/chat/message-parts";
import type { WorkspaceUIMessage } from "@/lib/chat/message";
import { getModel } from "@/lib/chat/models";
import { getSkill } from "@/lib/workspace/skill-data";
import {
  getSource,
  scopeLabel,
  type SourceScope,
} from "@/lib/workspace/source-data";
import { ResponseTurn } from "./response-turn";

/** A model response, or the placeholder while the request is in flight. */
export function LiveResponse({
  message,
  requestedAt,
  working,
  continuation,
  scope,
  onFork,
}: {
  message?: WorkspaceUIMessage;
  /** When the user's message was sent; the fallback start time. */
  requestedAt: string;
  working: boolean;
  continuation: boolean;
  scope?: SourceScope;
  onFork: () => void;
}) {
  const metadata = message?.metadata;
  const startedAt = metadata?.startedAt ?? requestedAt;
  const model = metadata?.modelId ? getModel(metadata.modelId) : undefined;
  const skill = metadata?.skillId ? getSkill(metadata.skillId) : undefined;
  const source = scope ? getSource(scope.sourceId) : undefined;
  const details = [
    model && { label: "Model", value: model.label },
    skill && { label: "Skill", value: skill.name },
    scope &&
      source && { label: "Source", value: `${source.name} · ${scopeLabel(scope)}` },
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
