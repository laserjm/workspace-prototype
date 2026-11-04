"use client";

import { useRef, useState } from "react";
import {
  ArrowUpCircle,
  BarChart3,
  ChevronRight,
  FolderPlus,
  GitPullRequest,
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
import { ProjectFilter } from "@/modules/projects";
import { useSources } from "@/modules/sources";
import {
  CustomSnoozeDialog,
  shelfOf,
  ThreadContextCard,
  ThreadRow,
  type Thread,
} from "@/modules/threads";

type SidebarProps = {
  threads: Thread[];
  projects: string[];
  activeId?: string;
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

export function WorkspaceSidebar(props: SidebarProps) {
  const { sourceById } = useSources();
  const [query, setQuery] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const searchRow = useRef<HTMLDivElement>(null);
  const [expandedShelves, setExpandedShelves] = useState<string[]>([]);
  const [customSnoozeId, setCustomSnoozeId] = useState<string | null>(null);
  const [contextId, setContextId] = useState<string | null>(null);
  const projects = [
    ...new Set([
      ...props.projects,
      ...props.threads.map((thread) => thread.project),
    ]),
  ];
  const filteredThreads = props.threads.filter(
    (thread) =>
      `${thread.title} ${thread.project} ${thread.branch} ${thread.scope ? sourceById(thread.scope.sourceId).name : ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (selectedProjects.length === 0 ||
        selectedProjects.includes(thread.project)),
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
        active={props.activeId === thread.id}
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
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <div className="sidebar-titlebar">
        <span className="app-wordmark">
          <strong>Workspace</strong>
        </span>
        <IconButton label="Toggle sidebar" onClick={props.onToggle}>
          <PanelLeftClose />
        </IconButton>
      </div>
      <div className="sidebar-search-row" ref={searchRow}>
        <label className="sidebar-search">
          <Search aria-hidden="true" />
          <input
            id="thread-search"
            type="search"
            aria-label="Search threads"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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

      <nav className="sidebar-threads" aria-label="Threads">
        <div className="sidebar-active-threads" aria-label="Active threads">
          {activeThreads.map(renderThread)}
          {activeThreads.length === 0 && (
            <p className="sidebar-empty">
              {query
                ? "No active threads found."
                : selectedProjects.length
                  ? "No active threads in these projects."
                  : "You’re all caught up."}
            </p>
          )}
        </div>
        <div className="sidebar-shelves">
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
                  className="archive-toggle"
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
                  <span className="archive-count">
                    {section.threads.length}
                  </span>
                  <ChevronRight
                    className={
                      expanded || query.trim() ? "chevron-expanded" : ""
                    }
                  />
                </button>
                <div
                  id={`shelf-${section.id}`}
                  className="archive-content"
                  hidden={visible.length === 0 && !expanded && !query.trim()}
                >
                  {visible.map(renderThread)}
                  {visible.length === 0 && (
                    <p className="shelf-empty">
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

      <div className="sidebar-bottom">
        {props.notice && (
          <div className="thread-undo-notice">
            <span role="status">{props.notice.message}</span>
            {props.notice.onUndo && (
              <button type="button" onClick={props.notice.onUndo}>
                Undo
              </button>
            )}
          </div>
        )}
        <div className="sidebar-footer">
          <IconButton label="Settings" onClick={props.onSettings}>
            <Settings />
          </IconButton>
          <IconButton label="Data sources" onClick={props.onSources}>
            <GitPullRequest />
          </IconButton>
          <IconButton label="Workspace activity" onClick={props.onActivity}>
            <BarChart3 />
          </IconButton>
          <span className="sidebar-footer-spacer" />
          <IconButton
            label="About this prototype"
            onClick={props.onSettings}
            className="about-button"
          >
            <ArrowUpCircle />
          </IconButton>
        </div>
      </div>
      {customSnoozeThread && (
        <CustomSnoozeDialog
          key={customSnoozeThread.id}
          thread={customSnoozeThread}
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
        <DialogContent className="thread-context-dialog">
          <DialogHeader>
            <DialogTitle>Session context</DialogTitle>
            <DialogDescription>
              Source records included in this conversation.
            </DialogDescription>
          </DialogHeader>
          {contextThread && <ThreadContextCard thread={contextThread} />}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
