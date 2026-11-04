// The models the composer offers. Choosing one is a demo preference; no provider is called.
import type { ModelChoice } from "../domain/model-choice";

export const sampleModelCatalog: ModelChoice[] = [
  {
    id: "opus",
    label: "Opus 5.5",
    effort: "High",
    provider: "claude",
  },
  {
    id: "sonnet",
    label: "Sonnet 5.5",
    effort: "High",
    provider: "claude",
  },
  { id: "gpt", label: "GPT-6.1", effort: "High", provider: "openai" },
];
