"use client";

import { Suspense, type ReactNode } from "react";
import { providerViews, type RecordTypeView } from "./record-views";
import { viewKindOf } from "@/modules/integrations/contracts";

/** Every registered view by its derived kind, `github.issue-view`. */
const viewsByKind: ReadonlyMap<string, RecordTypeView> = new Map(
  Object.entries(providerViews).flatMap(([providerId, views]) =>
    Object.entries(views.types).map(([type, view]) => [viewKindOf(providerId, type), view]),
  ),
);

/**
 * The body of a record view of `kind`, drawn by its provider from the record's `detail`. The
 * body's code loads with the first view of its kind, showing `fallback` meanwhile. A kind no
 * provider registers says so instead.
 */
export function RecordViewBody({
  kind,
  detail,
  fallback = null,
}: {
  kind: string;
  detail: unknown;
  fallback?: ReactNode;
}) {
  const View = viewsByKind.get(kind)?.view;
  if (!View)
    return (
      <p className="text-2xs text-muted-foreground">
        This kind of record can’t be shown here yet.
      </p>
    );
  return (
    <Suspense fallback={fallback}>
      <View detail={detail} />
    </Suspense>
  );
}
