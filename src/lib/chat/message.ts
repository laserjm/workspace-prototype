import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import type { AgentTools } from "@/lib/agent/tools";
import type { ModelId } from "./models";
import type { SkillId } from "@/lib/workspace/skill-data";

export type WorkspaceMessageMetadata = {
  /** User messages: when the message was sent. */
  createdAt?: string;
  /** User messages: attachment names (not yet uploaded to the model). */
  attachments?: string[];
  /** Assistant messages: stamped by the server on stream start and finish. */
  startedAt?: string;
  completedAt?: string;
  modelId?: ModelId;
  skillId?: SkillId;
};

export type WorkspaceUITools = InferUITools<AgentTools>;

export type WorkspaceUIMessage = UIMessage<
  WorkspaceMessageMetadata,
  UIDataTypes,
  WorkspaceUITools
>;
