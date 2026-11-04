"use client";

import { useState } from "react";
import { Cable, Folder, Search, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skills, type SkillId } from "@/lib/workspace/skill-data";
import { SkillIcon } from "./skill-picker";

export type SettingsSection = "general" | "skills";

export function WorkspaceSettings({
  section,
  onSection,
  enabledSkills,
  onToggleSkill,
  project,
  onSources,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  enabledSkills: SkillId[];
  onToggleSkill: (id: SkillId) => void;
  project: string | null;
  onSources: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = skills.filter((skill) =>
    `${skill.name} ${skill.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="settings-layout">
      <nav className="settings-navigation" aria-label="Settings sections">
        <button
          type="button"
          aria-pressed={section === "general"}
          onClick={() => onSection("general")}
        >
          <Settings2 />
          General
        </button>
        <button
          type="button"
          aria-pressed={section === "skills"}
          onClick={() => onSection("skills")}
        >
          <Wrench />
          Skills<span>{enabledSkills.length}</span>
        </button>
      </nav>
      {section === "general" ? (
        <section className="workspace-settings" aria-label="General settings">
          <h2>General</h2>
          <div>
            <Settings2 />
            <span>Appearance</span>
            <span className="ml-auto text-muted-foreground">Light</span>
          </div>
          <div>
            <Folder />
            <span>Project</span>
            <span className="ml-auto max-w-48 truncate text-muted-foreground">
              {project ?? "No project"}
            </span>
          </div>
          <Button variant="outline" onClick={onSources}>
            <Cable />
            Manage data sources
          </Button>
          <p className="settings-note">
            Conversations stay in this session. Skill activation and the source
            panel width are remembered in this browser.
          </p>
        </section>
      ) : (
        <section className="skills-settings" aria-label="Skills settings">
          <div className="skills-section-heading">
            <div>
              <h2>Skills</h2>
              <p>A little expertise for every thread.</p>
            </div>
            <span className="skills-active-count">
              {enabledSkills.length} of {skills.length} active
            </span>
          </div>
          <p className="skills-explanation">
            Activate the skills you want in your picker, then choose one for a
            message. Each skill works with any data source.
          </p>
          <label className="skills-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="Search skills"
              placeholder="Find a skill…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="skill-settings-list">
            {visible.map((skill) => {
              const enabled = enabledSkills.includes(skill.id);
              return (
                <article className="skill-settings-card" key={skill.id}>
                  <div className="skill-card-heading">
                    <span className="skill-card-icon">
                      <SkillIcon id={skill.id} />
                    </span>
                    <h3>{skill.name}</h3>
                    <span className="skill-card-state">
                      {enabled ? "Active" : "Inactive"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Activate ${skill.name}`}
                      className="skill-activation-switch"
                      onClick={() => onToggleSkill(skill.id)}
                    >
                      <span />
                    </button>
                  </div>
                  <p>{skill.description}</p>
                  <small>{skill.output}</small>
                  <details>
                    <summary>View instructions</summary>
                    <p>{skill.instructions}</p>
                  </details>
                </article>
              );
            })}
            {visible.length === 0 && (
              <p className="skills-no-results">
                No skills match “{query}”. Try another search.
              </p>
            )}
          </div>
          <p className="settings-note">
            Demo skills use sample records and prepared response formats.
            Activation is saved automatically in this browser.
          </p>
        </section>
      )}
    </div>
  );
}
