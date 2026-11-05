"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * The workspace's quiet 28px toolbar button. Exported for triggers that render
 * their own button (a combobox or menu trigger). `is-active` marks a toggled
 * button until callers pass aria-pressed instead.
 *
 * `workspace-icon-button` stays as a hook while workspace.css still sizes the
 * button in the composer toolbar and the source explorer.
 */
export const iconButtonClassName =
  "workspace-icon-button size-7 rounded-md text-icon-muted hover:bg-accent hover:text-accent-foreground disabled:opacity-40 [&_svg]:stroke-[1.65] [&.is-active]:bg-accent [&.is-active]:text-accent-foreground";

export function IconButton({
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(iconButtonClassName, className)}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
