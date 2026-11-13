// The browser's registry of each provider's record views and marks, keyed on the provider id
// (ADR 0003 §3). Adding a provider is one line here, beside its line in providers.ts.
import type { ComponentType } from "react";
import { githubViews } from "./providers/github/views";

type Mark = ComponentType<{ className?: string }>;

/**
 * What a record view's body gets: the provider's own detail for the record, as the detail route
 * answered it. The view checks it against its schema; there is no generic detail type.
 */
export type RecordViewProps = { detail: unknown };

/** One declared type in the browser: its view (a lazy, body-only component) and its kind mark. */
export type RecordTypeView = { view: ComponentType<RecordViewProps>; icon: Mark };

/** A provider's mark, and each declared record type's view and mark. */
export type ProviderViews = { icon: Mark; types: Readonly<Record<string, RecordTypeView>> };

export const providerViews: Readonly<Record<string, ProviderViews>> = {
  github: githubViews,
};
