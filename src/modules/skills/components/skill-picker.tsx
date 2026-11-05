"use client";

import { Check, ChevronDown, Settings2, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { activeSkills } from "../domain/skill";
import { SkillIcon } from "./skill-icon";
import { useSkills } from "./use-skills";

// The skill or "No skill" icon leads; it sits on the first line of text.
const skillItem =
  "gap-2.5 px-2 py-2.5 [&>svg:first-child]:mt-0.5 [&>svg:first-child]:self-start [&>svg:first-child]:text-muted-foreground";

export function SkillPicker({
  selected,
  enabledSkills,
  onSelect,
  onManage,
}: {
  selected?: string;
  enabledSkills: string[];
  onSelect: (id?: string) => void;
  onManage: () => void;
}) {
  const { skills, skillById } = useSkills();
  const available = activeSkills(skills, enabledSkills);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(inlineTriggerClassName, "mr-auto min-w-0")}
            aria-label={
              selected
                ? `Choose skill, ${skillById(selected).name}`
                : "Choose a skill"
            }
          />
        }
      >
        <SkillIcon id={selected} />
        <span>{selected ? skillById(selected).name : "Choose a skill"}</span>
        <ChevronDown className="size-2.5 text-muted-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-77.5 max-w-[calc(100vw-1.5rem)] p-1"
      >
        <div className="flex items-center justify-between px-2 py-2 text-2xs text-muted-foreground">
          <span>Skills</span>
          <small className="text-3xs text-muted-foreground/70">
            {available.length} active
          </small>
        </div>
        <DropdownMenuItem
          onClick={() => onSelect(undefined)}
          className={skillItem}
        >
          <Wrench />
          <span className="min-w-0 flex-1">
            <strong className="block text-xs font-medium text-secondary-foreground">
              No skill
            </strong>
            <small className="mt-1 block text-2xs leading-normal text-muted-foreground">
              Follow your prompt as written
            </small>
          </span>
          {!selected && <Check className="ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {available.map((skill) => (
          <DropdownMenuItem
            key={skill.id}
            onClick={() => onSelect(skill.id)}
            className={skillItem}
          >
            <SkillIcon id={skill.id} />
            <span className="min-w-0 flex-1">
              <strong className="block text-xs font-medium text-secondary-foreground">
                {skill.name}
              </strong>
              <small className="mt-1 block text-2xs leading-normal text-muted-foreground">
                {skill.description}
              </small>
            </span>
            {selected === skill.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        {available.length === 0 && (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            No active skills yet. Activate a skill in settings to use it here.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onManage} className="gap-2.5 px-2 py-2 text-xs">
          <Settings2 />
          Manage skills
          <span className="ml-auto text-3xs text-muted-foreground/70">
            {available.length}/{skills.length}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
