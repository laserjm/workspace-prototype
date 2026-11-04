"use client";

import {
  Check,
  ChevronDown,
  ListChecks,
  ScanLine,
  Settings2,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSkill, skills, type SkillId } from "@/lib/workspace/skill-data";

export function SkillIcon({ id }: { id?: SkillId }) {
  const Icon =
    id === "risk-review"
      ? ScanLine
      : id === "action-plan"
        ? ListChecks
        : Wrench;
  return <Icon aria-hidden />;
}

export function SkillPicker({
  selected,
  enabledSkills,
  onSelect,
  onManage,
}: {
  selected?: SkillId;
  enabledSkills: SkillId[];
  onSelect: (id?: SkillId) => void;
  onManage: () => void;
}) {
  const available = skills.filter((skill) => enabledSkills.includes(skill.id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="permission-trigger skill-picker-trigger"
            aria-label={
              selected
                ? `Choose skill, ${getSkill(selected).name}`
                : "Choose a skill"
            }
          />
        }
      >
        <SkillIcon id={selected} />
        <span>{selected ? getSkill(selected).name : "Choose a skill"}</span>
        <ChevronDown className="picker-chevron" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="skill-picker-menu"
      >
        <div className="skill-menu-heading">
          <span>Skills</span>
          <small>{available.length} active</small>
        </div>
        <DropdownMenuItem
          onClick={() => onSelect(undefined)}
          className="skill-menu-item"
        >
          <Wrench />
          <span>
            <strong>No skill</strong>
            <small>Follow your prompt as written</small>
          </span>
          {!selected && <Check className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {available.map((skill) => (
          <DropdownMenuItem
            key={skill.id}
            onClick={() => onSelect(skill.id)}
            className="skill-menu-item"
          >
            <SkillIcon id={skill.id} />
            <span>
              <strong>{skill.name}</strong>
              <small>{skill.description}</small>
            </span>
            {selected === skill.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        {available.length === 0 && (
          <p className="skill-menu-empty">
            No active skills yet. Activate a skill in settings to use it here.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage} className="manage-skills-item">
          <Settings2 />
          Manage skills
          <span className="ml-auto skill-menu-count">
            {available.length}/{skills.length}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
