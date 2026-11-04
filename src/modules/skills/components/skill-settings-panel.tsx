"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { SkillIcon } from "./skill-icon";
import { useSkills } from "./use-skills";

/** The skill catalogue with an activation switch per skill. */
export function SkillSettingsPanel({
  enabledSkills,
  onToggleSkill,
}: {
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
}) {
  const { skills } = useSkills();
  const [query, setQuery] = useState("");
  const visible = skills.filter((skill) =>
    `${skill.name} ${skill.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
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
        Demo skills use sample records and prepared response formats. Activation
        is saved automatically in this browser.
      </p>
    </section>
  );
}
