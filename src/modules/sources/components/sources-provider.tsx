"use client";

import type { ReactNode } from "react";
import type { Source } from "../domain/source";
import { SourcesContext } from "./use-sources";

export function SourcesProvider({
  sources,
  children,
}: {
  sources: Source[];
  children: ReactNode;
}) {
  return <SourcesContext value={sources}>{children}</SourcesContext>;
}
