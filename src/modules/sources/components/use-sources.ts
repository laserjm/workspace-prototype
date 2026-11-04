"use client";

import { createContext, useContext } from "react";
import { bug } from "@conventions/nextjs/core";
import { findSource, type Source } from "../domain/source";

export const SourcesContext = createContext<readonly Source[] | null>(null);

/** The source catalogue the page loaded, provided by `SourcesProvider`. */
export function useSources() {
  const sources = useContext(SourcesContext);
  if (!sources) bug("useSources is called outside SourcesProvider");
  return {
    sources,
    sourceById(id: string) {
      return findSource(sources, id) ?? bug(`unknown source '${id}'`);
    },
  };
}
