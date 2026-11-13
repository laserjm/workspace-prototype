import type { Source, SourceRecord } from "@/modules/sources";

export function aSourceRecord(
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    id: "PLAT-1",
    title: "Sample record",
    type: "Story",
    status: "To do",
    priority: "Medium",
    owner: "Alex Example",
    description: "A sample record.",
    summary: "A sample record.",
    nextStep: "Review the record.",
    updated: "Today, 09:00",
    ...overrides,
  };
}

export function aSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "sample:jira",
    connectionId: "sample",
    icon: "jira",
    name: "Jira",
    description: "Tickets",
    workspace: "Acme",
    location: "acme.example",
    collection: "Sprint 1",
    collectionPath: "PROJECT / SAMPLE",
    overviewTitle: "Sprint 1 at a glance",
    singular: "ticket",
    plural: "tickets",
    ...overrides,
  };
}
