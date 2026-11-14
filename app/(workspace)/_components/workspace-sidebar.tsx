"use client";

import { useRef, useState } from "react";
import {
  ArrowUpCircle,
  BarChart3,
  ChevronRight,
  FolderPlus,
  GitPullRequest,
  LogOut,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { ProjectFilter } from "./project-filter";
import { type ProjectListItem } from "@/modules/projects/contracts";
import { CustomSnoozeDialog } from "./custom-snooze-dialog";
import { shelfOf } from "@/modules/threads/placement";
import { ThreadContextCard } from "./thread-context-card";
import { ThreadRow } from "./thread-row";
import { type Thread } from "@/modules/threads/contracts";

type SidebarProps = {
  user: { name: string; email: string };
  threads: Thread[];
  projects: ProjectListItem[];
  /** The name the sidebar shows for a thread's project. */
  projectName: (projectId: string | null) => string;
  activeId?: string;
  /** The thread with a response in flight: only the open one can have one. */
  workingId?: string | null;
  onSelect: (thread: Thread) => void;
  onNewThread: () => void;
  onNewProject: () => void;
  onToggle: () => void;
  onSettings: () => void;
  onActivity: () => void;
  onSources: () => void;
  onSettle: (id: string, nextId: string | null) => void;
  onSnooze: (id: string, until: string, nextId: string | null) => void;
  onRestore: (id: string) => void;
  notice?: { message: string; onUndo?: () => void };
};

/** The filter's key for threads without a project; never a project id (those are UUIDs). */
const NO_PROJECT = "none";

export function WorkspaceSidebar(props: SidebarProps) {
  const [query, setQuery] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const searchRow = useRef<HTMLDivElement>(null);
  const [expandedShelves, setExpandedShelves] = useState<string[]>([]);
  const [customSnoozeId, setCustomSnoozeId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  // Threads without a project can be filtered too, under "No project".
  const projects = props.threads.some((thread) => !thread.projectId)
    ? [...props.projects, { id: NO_PROJECT, name: props.projectName(null) }]
    : props.projects;
  const filteredThreads = props.threads.filter(
    (thread) =>
      `${thread.title} ${props.projectName(thread.projectId)} ${thread.branch}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (selectedProjects.length === 0 ||
        selectedProjects.includes(thread.projectId ?? NO_PROJECT)),
  );
  const activeThreads = filteredThreads.filter(
    (thread) => shelfOf(thread) === "active",
  );
  const snoozedThreads = filteredThreads
    .filter((thread) => shelfOf(thread) === "snoozed")
    .sort((a, b) => Date.parse(a.snoozedUntil!) - Date.parse(b.snoozedUntil!));
  const settledThreads = filteredThreads
    .filter((thread) => shelfOf(thread) === "settled")
    .sort((a, b) => Date.parse(b.settledAt!) - Date.parse(a.settledAt!));
  const customSnoozeThread = props.threads.find(
    (thread) => thread.id === customSnoozeId,
  );
  const contextThread = props.threads.find((thread) => thread.id === contextId);

  function nextThread(id: string) {
    const index = activeThreads.findIndex((thread) => thread.id === id);
    return (
      [
        ...activeThreads.slice(index + 1),
        ...activeThreads.slice(0, Math.max(0, index)),
      ].find((thread) => thread.id !== id)?.id ?? null
    );
  }

  function renderThread(thread: Thread) {
    return (
      <ThreadRow
        key={thread.id}
        thread={thread}
        projectName={props.projectName(thread.projectId)}
        active={props.activeId === thread.id}
        working={props.workingId === thread.id}
        onSelect={() => props.onSelect(thread)}
        onSettle={() => props.onSettle(thread.id, nextThread(thread.id))}
        onRestore={() => props.onRestore(thread.id)}
        onSnooze={(until) =>
          props.onSnooze(thread.id, until, nextThread(thread.id))
        }
        onCustomSnooze={() => setCustomSnoozeId(thread.id)}
        onContext={() => setContextId(thread.id)}
      />
    );
  }

  return (
    <aside
      className={cn(
        "z-35 flex w-(--workspace-sidebar-width) shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        // Desktop: collapsing hides it. Phones: a drawer that slides in over the canvas.
        "md:group-data-[sidebar=collapsed]/app:hidden",
        "max-md:invisible max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-74 max-md:max-w-[calc(100vw-3rem)] max-md:-translate-x-full max-md:transition-[translate,visibility] max-md:duration-180 max-md:ease-in-out",
        "max-md:group-data-[mobile-sidebar=open]/app:visible max-md:group-data-[mobile-sidebar=open]/app:translate-x-0",
      )}
      aria-label="Workspace sidebar"
    >
      <div className="flex h-13.5 shrink-0 items-center justify-between gap-2 px-3 max-desktop:gap-1.5 max-desktop:px-2.5">
        <strong className="font-semibold whitespace-nowrap text-foreground">
          Workspace
        </strong>
        <IconButton label="Toggle sidebar" onClick={props.onToggle}>
          <PanelLeftClose />
        </IconButton>
      </div>
      <div
        className="flex min-h-14 items-center gap-1 px-3 pb-0.5 4xl:min-h-15"
        ref={searchRow}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-icon-muted focus-within:ring-2 focus-within:ring-border">
          <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.6} />
          <input
            id="thread-search"
            type="search"
            aria-label="Search threads"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full min-w-0 border-0 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <ProjectFilter
          projects={projects}
          selected={selectedProjects}
          onChange={setSelectedProjects}
          anchor={searchRow}
        />
        <IconButton label="Add project" onClick={props.onNewProject}>
          <FolderPlus />
        </IconButton>
        <IconButton label="New thread" onClick={props.onNewThread}>
          <SquarePen />
        </IconButton>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5 [scrollbar-width:thin]"
        aria-label="Threads"
      >
        <div aria-label="Active threads">
          {activeThreads.map(renderThread)}
          {activeThreads.length === 0 && (
            <p className="px-2 py-6 text-center text-secondary-label">
              {query
                ? "No active threads found."
                : selectedProjects.length
                  ? "No active threads in these projects."
                  : "You’re all caught up."}
            </p>
          )}
        </div>
        <div className="mt-auto">
          {[
            { id: "snoozed", label: "Snoozed", threads: snoozedThreads },
            { id: "settled", label: "Settled", threads: settledThreads },
          ].map((section) => {
            const expanded = expandedShelves.includes(section.id);
            // Keep a selected parked session discoverable even when its shelf is collapsed.
            const visible =
              expanded || query.trim()
                ? section.threads
                : section.threads.filter(
                    (thread) => thread.id === props.activeId,
                  );
            return (
              <section key={section.id} aria-label={`${section.label} threads`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-1.5 py-2 text-xs text-secondary-label hover:bg-sidebar-row-hover"
                  aria-expanded={expanded || Boolean(query.trim())}
                  aria-controls={`shelf-${section.id}`}
                  onClick={() =>
                    setExpandedShelves((previous) =>
                      expanded
                        ? previous.filter((id) => id !== section.id)
                        : [...previous, section.id],
                    )
                  }
                >
                  <span>{section.label}</span>
                  <span className="ml-auto">{section.threads.length}</span>
                  <ChevronRight
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className={cn(
                      "size-3 transition-transform duration-120",
                      (expanded || query.trim()) && "rotate-90",
                    )}
                  />
                </button>
                <div
                  id={`shelf-${section.id}`}
                  className="pt-1 pb-2 text-xs text-secondary-label"
                  hidden={visible.length === 0 && !expanded && !query.trim()}
                >
                  {visible.map(renderThread)}
                  {visible.length === 0 && (
                    <p className="px-2 pt-2 pb-3">
                      {query
                        ? `No matching ${section.label.toLowerCase()} threads.`
                        : `No ${section.label.toLowerCase()} threads.`}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 px-2">
        {props.notice && (
          <div className="flex min-h-8.5 items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
            <span role="status">{props.notice.message}</span>
            {props.notice.onUndo && (
              <button
                type="button"
                onClick={props.notice.onUndo}
                className="ml-auto font-medium text-secondary-foreground"
              >
                Undo
              </button>
            )}
          </div>
        )}
        <div className="flex h-14 items-center gap-2.5">
          <IconButton label="Settings" onClick={props.onSettings}>
            <Settings />
          </IconButton>
          <IconButton label="Data sources" onClick={props.onSources}>
            <GitPullRequest />
          </IconButton>
          <IconButton label="Workspace activity" onClick={props.onActivity}>
            <BarChart3 />
          </IconButton>
          <span className="flex-1" />
          {/* A plain form post: /api/sign-out ends the session here and in Keycloak. */}
          <form action="/api/sign-out" method="post">
            <IconButton
              type="submit"
              label={`Sign out ${props.user.name || props.user.email}`}
            >
              <LogOut />
            </IconButton>
          </form>
          <IconButton
            label="About this prototype"
            onClick={props.onSettings}
            className="size-8.5 rounded-full bg-accent text-foreground [&_svg:not([class*='size-'])]:size-4.5"
          >
            <ArrowUpCircle />
          </IconButton>
        </div>
      </div>
      {customSnoozeThread && (
        <CustomSnoozeDialog
          key={customSnoozeThread.id}
          thread={customSnoozeThread}
          working={props.workingId === customSnoozeThread.id}
          onClose={() => setCustomSnoozeId(null)}
          onSnooze={(until) => {
            props.onSnooze(
              customSnoozeThread.id,
              until,
              nextThread(customSnoozeThread.id),
            );
            setCustomSnoozeId(null);
          }}
        />
      )}
      <Dialog
        open={Boolean(contextThread)}
        onOpenChange={(open) => {
          if (!open) setContextId(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>About this thread</DialogTitle>
            <DialogDescription>
              Where the thread sits and how much its conversation holds.
            </DialogDescription>
          </DialogHeader>
          {contextThread && (
            <ThreadContextCard
              thread={contextThread}
              projectName={props.projectName(contextThread.projectId)}
              className="p-0"
            />
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
