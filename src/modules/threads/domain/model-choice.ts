import type { ModelProvider } from "./thread";

/** A model the composer offers. */
export type ModelChoice = {
  id: string;
  label: string;
  effort: string;
  provider: ModelProvider;
};
