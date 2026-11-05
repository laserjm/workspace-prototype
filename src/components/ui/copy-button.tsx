"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { IconButton } from "./icon-button";

/** An icon button that copies `text`, and says so for a moment after. */
export function CopyButton({
  text,
  label = "Copy",
  ...props
}: { text: string; label?: string } & Omit<
  ComponentProps<typeof IconButton>,
  "label" | "onClick" | "children"
>) {
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  return (
    <IconButton
      {...props}
      label={copiedAt === null ? label : "Copied"}
      onClick={async () => {
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
      }}
    >
      {copiedAt === null ? <Copy /> : <Check />}
    </IconButton>
  );
}
