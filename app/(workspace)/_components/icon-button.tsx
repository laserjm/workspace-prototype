"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The workspace's quiet 28px toolbar button. Exported for triggers that render
 * their own button (a combobox or menu trigger). A toggle passes aria-pressed
 * and reads as active while it is pressed.
 */
export const iconButtonClassName =
  "size-7 rounded-md text-icon-muted hover:bg-accent hover:text-accent-foreground disabled:opacity-40 [&_svg]:stroke-[1.65] aria-pressed:bg-accent aria-pressed:text-accent-foreground";

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
