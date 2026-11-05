"use client";

import { Search } from "lucide-react";
import { SkillIcon } from "./skill-icon";
import { useSkills } from "./use-skills";

/** The skill catalogue with an activation switch per skill. */
export function SkillSettingsPanel({
  enabledSkills,
  onToggleSkill,
  query,
  onQueryChange,
}: {
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { skills } = useSkills();
  const visible = skills.filter((skill) =>
    `${skill.name} ${skill.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section aria-label="Skills settings">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-foreground">Skills</h2>
          <p className="mt-1 text-xs text-muted-foreground max-md:text-2xs">
            A little expertise for every thread.
          </p>
        </div>
        <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.75 text-3xs text-muted-foreground">
          {enabledSkills.length} of {skills.length} active
        </span>
      </div>
      <p className="my-3.5 text-2xs leading-relaxed text-muted-foreground">
        Activate the skills you want in your picker, then choose one for a
        message. Each skill works with any data source.
      </p>
      <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-muted-foreground/70 focus-within:border-ring">
        <Search size={15} className="shrink-0" />
        <input
          className="w-full min-w-0 bg-transparent text-xs text-secondary-foreground outline-none placeholder:text-placeholder"
          type="search"
          aria-label="Search skills"
          placeholder="Find a skill…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="my-3.5 flex flex-col gap-2.5">
        {visible.map((skill) => {
          const enabled = enabledSkills.includes(skill.id);
          return (
            <article
              className="rounded-lg border border-border p-3.5 max-md:p-3"
              key={skill.id}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground [&_svg]:size-3.5">
                  <SkillIcon id={skill.id} />
                </span>
                <h3 className="text-xs font-medium text-secondary-foreground">
                  {skill.name}
                </h3>
                <span className="ml-auto text-3xs text-muted-foreground/70">
                  {enabled ? "Active" : "Inactive"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Activate ${skill.name}`}
                  className="group/switch flex h-4.5 w-7.5 shrink-0 items-center rounded-full bg-input p-0.5 aria-checked:bg-secondary-foreground"
                  onClick={() => onToggleSkill(skill.id)}
                >
                  <span className="size-3.5 rounded-full bg-card shadow-xs transition-transform duration-120 group-aria-checked/switch:translate-x-3" />
                </button>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                {skill.description}
              </p>
              <small className="mt-1.5 block text-3xs leading-normal text-muted-foreground/70">
                {skill.output}
              </small>
              <details className="mt-3 text-3xs leading-relaxed text-muted-foreground">
                <summary className="cursor-pointer">View instructions</summary>
                <p className="mt-1.5 border-l-2 border-border pl-2.5">
                  {skill.instructions}
                </p>
              </details>
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No skills match “{query}”. Try another search.
          </p>
        )}
      </div>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Demo skills use sample records and prepared response formats. Activation
        is saved automatically in this browser.
      </p>
    </section>
  );
}
