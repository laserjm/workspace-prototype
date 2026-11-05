"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, Folder, ListFilter, Search } from "lucide-react";
import { projectInitials, type Project } from "../domain/project";

// `project` is the project's id; null: "All projects".
type ProjectItem = { value: string; label: string; project: string | null };

function ProjectBadge({ name }: { name: string }) {
  return (
    <span className="project-filter-badge" aria-hidden="true">
      {projectInitials(name)}
    </span>
  );
}

export function ProjectFilter({
  projects,
  selected,
  onChange,
  anchor,
}: {
  projects: Project[];
  /** Project ids. */
  selected: string[];
  onChange: (projectIds: string[]) => void;
  anchor: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const highlighted = useRef<ProjectItem | undefined>(undefined);
  const items = useMemo<ProjectItem[]>(
    () => [
      { value: "all", label: "All projects", project: null },
      ...projects.map(({ id, name }) => ({
        value: `project:${id}`,
        label: name,
        project: id,
      })),
    ],
    [projects],
  );
  const filteredItems = query.trim()
    ? items.filter(
        (item) =>
          item.project !== null &&
          item.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;
  const selectedItem =
    items.find((item) => item.project === selected[0]) ?? items[0];
  const selectedNames = selected.map(
    (id) => projects.find((project) => project.id === id)?.name ?? id,
  );
  const label = selected.length
    ? `Filter threads by project: ${selectedNames.join(", ")}`
    : "Filter threads by project";

  function toggleProject(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((project) => project !== id)
        : [...selected, id],
    );
  }

  return (
    <Combobox.Root
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      value={selectedItem}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setQuery("");
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
      onValueChange={(item, details) => {
        if (!item) return;
        if (item.project === null) {
          onChange([]);
        } else if ("shiftKey" in details.event && details.event.shiftKey) {
          details.cancel();
          toggleProject(item.project);
        } else {
          onChange([item.project]);
        }
      }}
    >
      <Combobox.Trigger
        aria-label={label}
        title={label}
        className={`workspace-icon-button project-filter-trigger ${selected.length ? "is-active" : ""}`}
      >
        {selected.length ? (
          <span className="project-filter-badge-stack">
            {selectedNames.slice(0, 2).map((name) => (
              <ProjectBadge key={name} name={name} />
            ))}
          </span>
        ) : (
          <ListFilter aria-hidden="true" />
        )}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          anchor={anchor}
          align="start"
          sideOffset={0}
          className="project-filter-positioner"
        >
          <Combobox.Popup className="project-filter-popup">
            <div className="project-filter-search">
              <Search aria-hidden="true" />
              <Combobox.Input
                aria-label="Search projects"
                placeholder="Search projects..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    !event.nativeEvent.isComposing &&
                    event.shiftKey &&
                    event.key === "Enter" &&
                    highlighted.current?.project
                  ) {
                    event.preventDefault();
                    toggleProject(highlighted.current.project);
                  }
                }}
              />
            </div>
            <Combobox.Empty className="project-filter-empty">
              No matching projects.
            </Combobox.Empty>
            <Combobox.List
              className="project-filter-list"
              aria-label="Projects"
              aria-multiselectable="true"
            >
              {(item: ProjectItem) => {
                const isSelected = item.project
                  ? selected.includes(item.project)
                  : selected.length === 0;
                return (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    aria-selected={isSelected}
                    className="project-filter-item"
                  >
                    <span className="project-filter-row-icon">
                      {item.project ? (
                        <ProjectBadge name={item.label} />
                      ) : (
                        <Folder aria-hidden="true" />
                      )}
                      {isSelected && (
                        <span className="project-filter-check">
                          <Check aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="project-filter-name">{item.label}</span>
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
            <p className="project-filter-hint">
              Shift-select to include multiple projects
            </p>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
