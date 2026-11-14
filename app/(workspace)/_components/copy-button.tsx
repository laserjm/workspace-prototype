"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton, iconButtonClassName } from "./icon-button";

/** Whether something was just copied, and the copy that says so for a moment after. */
function useCopy() {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    const at = Date.now();
    setCopiedAt(at);
    setTimeout(
      () => setCopiedAt((current) => (current === at ? null : current)),
      1500,
    );
  };
  return { copied: copiedAt !== null, copy };
}

/** An icon button that copies `text`. */
export function CopyButton({
  text,
  label = "Copy",
  ...props
}: { text: string; label?: string } & Omit<
  ComponentProps<typeof IconButton>,
  "label" | "onClick" | "children"
>) {
  const { copied, copy } = useCopy();
  return (
    <IconButton {...props} label={copied ? "Copied" : label} onClick={() => copy(text)}>
      {copied ? <Check /> : <Copy />}
    </IconButton>
  );
}

/** An icon button with a menu of formats to copy; each format's text is made when chosen. */
export function CopyDropdownMenu({
  label,
  formats,
  className,
}: {
  label: string;
  formats: { label: string; text: () => string }[];
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={copied ? "Copied" : label}
            className={cn(iconButtonClassName, className)}
          />
        }
      >
        {copied ? <Check /> : <Copy />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {formats.map((format) => (
          <DropdownMenuItem key={format.label} onClick={() => copy(format.text())}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
