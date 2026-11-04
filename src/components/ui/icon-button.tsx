"use client";

import type { ComponentProps } from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function IconButton({
  label,
  className = "",
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
            className={`workspace-icon-button ${className}`}
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
