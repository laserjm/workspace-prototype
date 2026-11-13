// The browser's registry of what each provider draws for its records, keyed on the provider id
// (ADR 0003 §3). Adding a provider is one line here, beside its line in providers.ts.
import type { ComponentType } from "react";
import { githubMarks } from "./providers/github/views";

type Mark = ComponentType<{ className?: string }>;

/** A provider's mark, and each declared record type's kind mark. */
export type RecordMarks = { provider: Mark; types: Readonly<Record<string, Mark>> };

export const recordMarks: Readonly<Record<string, RecordMarks>> = {
  github: githubMarks,
};
