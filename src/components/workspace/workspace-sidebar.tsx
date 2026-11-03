"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpCircle,
  BarChart3,
  Check,
  CircleCheck,
  ChevronRight,
  FolderGit2,
  FolderPlus,
  GitBranch,
  GitPullRequest,
  ListFilter,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Thread } from "./workspace-data";
import { LinuxIcon, ProjectIcon, ProviderIcon } from "./workspace-icons";
import { IconButton } from "./icon-button";

type SidebarProps = {
  threads: Thread[];
  activeId?: string;
  onSelect: (thread: Thread) => void;
  onNewThread: () => void;
  onNewProject: () => void;
  onToggle: () => void;
  onSettings: () => void;
  onActivity: () => void;
  onSources: () => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

export function WorkspaceSidebar(props: SidebarProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null);
  const filteredThreads = props.threads.filter(
    (thread) =>
      `${thread.title} ${thread.project} ${thread.branch}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || (filter === "done" ? thread.done : !thread.done)),
  );
  const doneThreads = props.threads.filter((thread) => thread.done);

  return (
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <div className="sidebar-titlebar">
        <div className="window-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <IconButton label="Toggle sidebar" onClick={props.onToggle}>
          <PanelLeftClose />
        </IconButton>
        <span className="app-wordmark">
          <strong>T3</strong> Code
        </span>
        <div className="sidebar-history">
          <IconButton
            label="Go back"
            disabled={!props.canGoBack}
            onClick={props.onBack}
          >
            <ArrowLeft />
          </IconButton>
          <IconButton
            label="Go forward"
            disabled={!props.canGoForward}
            onClick={props.onForward}
          >
            <ArrowRight />
          </IconButton>
        </div>
      </div>

      <div className="sidebar-search-row">
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label="Filter threads"
                variant="ghost"
                size="icon-sm"
                className={`workspace-icon-button ${filter !== "all" ? "is-active" : ""}`}
              />
            }
          >
            <ListFilter />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {[
              { id: "all", label: "All threads" },
              { id: "active", label: "Active threads" },
              { id: "done", label: "Completed threads" },
            ].map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                {filter === item.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Add project" onClick={props.onNewProject}>
          <FolderPlus />
        </IconButton>
        <IconButton label="New thread" onClick={props.onNewThread}>
          <SquarePen />
        </IconButton>
      </div>

      <nav className="sidebar-threads" aria-label="Threads">
        {filteredThreads.map((thread) => (
          <button
            type="button"
            key={thread.id}
            className={`thread-item ${props.activeId === thread.id ? "thread-item-active" : ""}`}
            onClick={() => props.onSelect(thread)}
            aria-current={props.activeId === thread.id ? "page" : undefined}
          >
            <span className="thread-project-row">
              <ProjectIcon kind={thread.kind} />
              <span className="thread-project-name">{thread.project}</span>
              {thread.done ? (
                <span className="thread-done">
                  <CircleCheck />
                  Done
                </span>
              ) : (
                <span className="thread-age">{thread.age}</span>
              )}
            </span>
            <span className="thread-title" title={thread.title}>
              {thread.title}
            </span>
            <span className="thread-meta">
              {thread.done && (
                <FolderGit2 aria-hidden className="thread-branch-icon" />
              )}
              <span className="thread-branch" title={thread.branch}>
                {thread.branch}
              </span>
              {thread.changes && (
                <span className="thread-changes">
                  <GitBranch aria-hidden />
                  {thread.done ? "+" : ""}
                  {thread.changes}
                </span>
              )}
              {(thread.kind === "rocket" || thread.kind === "chart") && (
                <LinuxIcon />
              )}
              <ProviderIcon provider={thread.provider} />
            </span>
          </button>
        ))}
        {filteredThreads.length === 0 && (
          <p className="sidebar-empty">No threads found.</p>
        )}
      </nav>

      <div className="sidebar-bottom">
        {[
          { id: "snoozed", label: "Snoozed", count: 0 },
          { id: "settled", label: "Settled", count: doneThreads.length },
        ].map((section) => (
          <div key={section.id}>
            <button
              type="button"
              className="archive-toggle"
              aria-expanded={expandedArchive === section.id}
              onClick={() =>
                setExpandedArchive(
                  expandedArchive === section.id ? null : section.id,
                )
              }
            >
              <span>{section.label}</span>
              <span className="archive-count">{section.count}</span>
              <ChevronRight
                className={
                  expandedArchive === section.id ? "chevron-expanded" : ""
                }
              />
            </button>
            {expandedArchive === section.id && (
              <div className="archive-content">
                {section.id === "settled" && doneThreads.length > 0 ? (
                  doneThreads.map((thread) => (
                    <button
                      type="button"
                      key={thread.id}
                      onClick={() => props.onSelect(thread)}
                    >
                      {thread.title}
                    </button>
                  ))
                ) : (
                  <p>No snoozed threads.</p>
                )}
              </div>
            )}
          </div>
        ))}
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
    </aside>
  );
}
