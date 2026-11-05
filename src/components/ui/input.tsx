import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A single-line text field: dialogs and forms. Sidebar and popup search fields are bare inputs. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-9.5 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-placeholder focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
