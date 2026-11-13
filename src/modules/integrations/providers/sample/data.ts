// Fictional enterprise records bundled with the prototype, one sample source per product.
// Nothing here calls an external system.
import type { SourceRecord } from "@/modules/sources";
import type { ProductPresentation, SourceSummary } from "../../contracts";

/** A sample source: its summary and presentation in one, keyed by its product's id. */
export type SampleSource = Omit<SourceSummary, "key" | "product"> &
  Omit<ProductPresentation, "icon"> & { id: string; records: SourceRecord[] };

export const sampleSources: SampleSource[] = [
  {
    id: "jira",
    name: "Jira",
    description: "Tickets, sprints & delivery",
    workspace: "Acme Engineering",
    location: "acme.atlassian.net",
    collection: "Platform · Sprint 24",
    singular: "ticket",
    plural: "tickets",
    collectionPath: "PROJECT / PLATFORM",
    overviewTitle: "Sprint 24 at a glance",
    records: [
      {
        id: "PLAT-124",
        title: "Enable SSO for enterprise workspaces",
        type: "Story",
        status: "In progress",
        priority: "High",
        owner: "Maya Chen",
        description:
          "Add SAML single sign-on for enterprise customers. The sign-in flow and identity-provider configuration are implemented. Security review and end-to-end testing remain before rollout.",
        summary:
          "SAML sign-in is implemented; security review and end-to-end tests are still outstanding.",
        risk: "Enterprise rollout depends on the security team completing its review.",
        nextStep:
          "Maya to schedule the security review and finish the SAML test matrix.",
        updated: "Today, 10:42",
      },
      {
        id: "PLAT-125",
        title: "Fix intermittent webhook delivery failures",
        type: "Bug",
        status: "In progress",
        priority: "High",
        owner: "Leo Fischer",
        description:
          "About 2% of outgoing webhooks time out during traffic spikes. A retry queue is in development. Production traces point to connection-pool exhaustion; the new pool configuration still needs load testing.",
        summary:
          "A retry queue is in development to address the 2% delivery failure rate during traffic spikes.",
        risk: "Customer events can still be lost until the retry queue and pool fix pass load testing.",
        nextStep:
          "Leo to load-test the connection-pool change and validate retry delivery.",
        updated: "Today, 09:18",
      },
      {
        id: "PLAT-126",
        title: "Add audit log export",
        type: "Story",
        status: "In review",
        priority: "Medium",
        owner: "Priya Shah",
        description:
          "Allow workspace administrators to export the last 90 days of audit events as CSV. Implementation and automated tests are complete. Product is reviewing column names and timezone formatting.",
        summary:
          "The 90-day CSV export is implemented and tested, awaiting product review.",
        nextStep:
          "Priya to incorporate product feedback on CSV columns and timezone formatting.",
        updated: "Yesterday, 16:35",
      },
      {
        id: "PLAT-127",
        title: "Migrate workspace settings to the new API",
        type: "Task",
        status: "Done",
        priority: "Medium",
        owner: "Jonas Weber",
        description:
          "Move workspace settings reads and writes to API v2. Migration has shipped to all workspaces. Monitoring shows no increase in errors, and the legacy endpoint has been removed.",
        summary:
          "API v2 migration has shipped with stable monitoring; the legacy endpoint is removed.",
        nextStep: "No further action; continue normal monitoring.",
        updated: "Yesterday, 14:02",
      },
      {
        id: "PLAT-128",
        title: "Introduce per-workspace rate limits",
        type: "Story",
        status: "To do",
        priority: "High",
        owner: "Alex Morgan",
        description:
          "Introduce configurable API quotas per workspace to isolate noisy tenants. The proposal uses a token bucket backed by Redis. Implementation is waiting for the infrastructure team to provision the shared Redis cluster.",
        summary:
          "The rate-limit design is ready, but implementation is waiting on a shared Redis cluster.",
        risk: "Infrastructure provisioning blocks implementation and could push the work beyond this sprint.",
        nextStep:
          "Alex to confirm a Redis provisioning date with infrastructure.",
        updated: "Yesterday, 11:20",
      },
    ],
  },
  {
    id: "confluence",
    name: "Confluence",
    description: "Pages, decisions & knowledge",
    workspace: "Acme Engineering",
    location: "acme.atlassian.net/wiki",
    collection: "Platform knowledge base",
    singular: "page",
    plural: "pages",
    collectionPath: "SPACE / PLATFORM",
    overviewTitle: "Platform knowledge at a glance",
    records: [
      {
        id: "DOC-201",
        title: "Enterprise authentication architecture",
        type: "Architecture",
        status: "In review",
        priority: "High",
        owner: "Maya Chen",
        description:
          "Design for SAML authentication, tenant isolation, and identity-provider setup. Includes session expiry, recovery flows, and required security controls. Security sign-off is pending.",
        summary:
          "The SAML architecture covers tenant isolation and recovery; security sign-off is pending.",
        risk: "Authentication design needs approval before enterprise rollout.",
        nextStep: "Resolve security review comments with the identity team.",
        updated: "Today, 10:10",
      },
      {
        id: "DOC-202",
        title: "Webhook reliability runbook",
        type: "Runbook",
        status: "Done",
        priority: "Medium",
        owner: "Leo Fischer",
        description:
          "Operational guide for diagnosing failed deliveries, replaying events, and monitoring queue depth. The escalation path and recovery checklist were tested during the last incident drill.",
        summary:
          "The runbook documents event replay, monitoring, and a tested recovery checklist.",
        nextStep: "Update the runbook when the new retry queue ships.",
        updated: "Yesterday, 15:30",
      },
      {
        id: "DOC-203",
        title: "Platform Q4 delivery plan",
        type: "Planning",
        status: "In progress",
        priority: "High",
        owner: "Priya Shah",
        description:
          "Quarterly delivery plan covering enterprise SSO, audit exports, and tenant rate limits. Owners are assigned. Infrastructure capacity for Redis is still unconfirmed.",
        summary:
          "The Q4 plan has owners for SSO, audit exports, and rate limits; Redis capacity is unconfirmed.",
        risk: "The rate-limit milestone depends on infrastructure capacity.",
        nextStep:
          "Confirm infrastructure capacity and update the delivery dates.",
        updated: "Today, 08:45",
      },
    ],
  },
  {
    id: "codebeamer",
    name: "Codebeamer",
    description: "Requirements, tests & traceability",
    workspace: "Acme Mobility",
    location: "codebeamer.acme.example",
    collection: "Battery management · Release 2.4",
    singular: "item",
    plural: "items",
    collectionPath: "PROJECT / BATTERY MANAGEMENT",
    overviewTitle: "Release 2.4 at a glance",
    records: [
      {
        id: "REQ-401",
        title: "Detect cell overvoltage within 100 ms",
        type: "Requirement",
        status: "In review",
        priority: "High",
        owner: "Nora Klein",
        description:
          "The battery controller shall detect a cell voltage above 4.25 V within 100 ms and record a diagnostic event. Bench tests pass; independent verification is outstanding.",
        summary:
          "Overvoltage detection passes bench tests; independent verification is outstanding.",
        risk: "Release acceptance requires an independent verification record.",
        nextStep:
          "Assign an independent reviewer and attach verification evidence.",
        updated: "Today, 11:00",
      },
      {
        id: "REQ-402",
        title: "Record thermal shutdown events",
        type: "Requirement",
        status: "In progress",
        priority: "High",
        owner: "Emil Hoffmann",
        description:
          "Persist timestamp, sensor readings, and shutdown cause for all thermal events. Firmware logging is implemented; integration with diagnostic export is in progress.",
        summary:
          "Thermal event logging is implemented; diagnostic export integration is ongoing.",
        nextStep: "Complete the diagnostic export integration test.",
        updated: "Today, 09:50",
      },
      {
        id: "TEST-403",
        title: "Validate safe-state transition on sensor loss",
        type: "Test case",
        status: "To do",
        priority: "High",
        owner: "Sofia Rossi",
        description:
          "Disconnect each temperature sensor and verify safe-state transition within the specified interval. The test procedure is approved, but the hardware-in-the-loop rig is unavailable until the next calibration window.",
        summary:
          "The sensor-loss test is approved but cannot run until the HIL rig is available.",
        risk: "An unavailable HIL rig blocks safety-test execution.",
        nextStep:
          "Book the HIL rig after calibration and execute the approved procedure.",
        updated: "Yesterday, 16:00",
      },
      {
        id: "REQ-404",
        title: "Maintain requirements-to-test traceability",
        type: "Requirement",
        status: "Done",
        priority: "Medium",
        owner: "Nora Klein",
        description:
          "Every release 2.4 safety requirement has at least one linked verification test. The traceability matrix has been reviewed and baselined; test execution status is tracked separately.",
        summary:
          "The requirements-to-test traceability matrix is reviewed and baselined.",
        nextStep:
          "Maintain links when requirements change; track execution separately.",
        updated: "Yesterday, 13:40",
      },
    ],
  },
];
