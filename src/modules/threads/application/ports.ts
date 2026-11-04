import type { Result, ValidationFailed } from "@conventions/nextjs/core";
import type { Skill } from "@/modules/skills";
import type { Source, SourceRecord } from "@/modules/sources";
import type { ModelChoice } from "../domain/model-choice";

/** A model the workspace offers, with the id the gateway knows it by. Server-side only. */
export type GatewayModel = ModelChoice & { gateway: string };

/** The records a thread attached, resolved on the server from their ids. */
export type AttachedRecords = {
  source: Source;
  records: SourceRecord[];
  /** How many records the thread named; the label says "5 tickets" even if one is gone. */
  recordCount: number;
};

export type ResponseRequest = {
  model: GatewayModel;
  skill?: Skill;
  attached?: AttachedRecords;
  /** The conversation as the chat transport sent it; the agent validates it. */
  messages: unknown[];
  signal?: AbortSignal;
};

/** Streams the assistant's reply to a thread's conversation. */
export type ResponseAgent = {
  answer(request: ResponseRequest): Promise<Result<Response, ValidationFailed>>;
};
