"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Source } from "../contracts";
import { SourceRecordsStore } from "./source-records-store";
import { SourcesContext } from "./use-sources";

export function SourcesProvider({
  sources,
  children,
}: {
  sources: Source[];
  children: ReactNode;
}) {
  // One store per page: records load once, when a view first needs them.
  const [records] = useState(() => new SourceRecordsStore());
  const value = useMemo(() => ({ sources, records }), [sources, records]);
  return <SourcesContext value={value}>{children}</SourcesContext>;
}
