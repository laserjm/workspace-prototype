import { BookOpen, Database, Layers, Workflow } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Layers> = {
  jira: Layers,
  confluence: BookOpen,
  codebeamer: Workflow,
};

// Each source keeps its own tint; unknown sources look like Jira.
const TONES: Record<string, string> = {
  jira: "border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
  confluence:
    "border-sky-100 bg-sky-50 text-blue-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
  codebeamer:
    "border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
};

const mark = cva(
  "inline-flex shrink-0 items-center justify-center",
  {
    variants: {
      size: {
        lg: "size-8 rounded-md border", // cards and dialogs
        md: "size-7 rounded-md border", // menu rows
        sm: "size-5.5 rounded-sm border", // inline with text
        xs: "size-4.5 rounded-sm border", // sidebar rows
        plain: "size-3.5", // a bare icon in the text colour
      },
    },
    defaultVariants: { size: "lg" },
  },
);

// On the svg itself, so menus and buttons that size bare svgs leave it alone.
const ICON_SIZES = {
  lg: "size-4.5",
  md: "size-4.5",
  sm: "size-3.5",
  xs: "size-3",
  plain: "size-3.5",
} as const;

/** A source's mark, by its product's `icon` (presentation data, not the source's id). */
export function SourceIcon({
  icon,
  size = "lg",
  className,
  iconClassName,
}: {
  icon: string;
  className?: string;
  iconClassName?: string;
} & VariantProps<typeof mark>) {
  const Icon = ICONS[icon] ?? Database;
  return (
    <span
      className={cn(
        mark({ size }),
        size !== "plain" && (TONES[icon] ?? TONES.jira),
        className,
      )}
      aria-hidden
    >
      <Icon
        strokeWidth={size === "plain" ? 1.5 : 1.9}
        className={cn(ICON_SIZES[size ?? "lg"], iconClassName)}
      />
    </span>
  );
}
