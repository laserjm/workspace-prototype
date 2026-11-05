import { cn } from "@/lib/utils";
import type { ModelProvider } from "../domain/thread";

const icon = "size-4 shrink-0";
import { claudePath, openAIPath } from "./provider-paths";

export function ProviderIcon({
  provider = "claude",
  className,
}: {
  provider?: ModelProvider;
  className?: string;
}) {
  if (provider === "openai")
    return (
      <svg
        aria-hidden
        viewBox="100 100 411 411"
        fill="currentColor"
        className={cn(icon, "text-icon-muted", className)}
      >
        <path d={openAIPath} fillRule="evenodd" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg
      aria-hidden
      viewBox="0 0 256 257"
      className={cn(icon, "text-provider-claude", className)}
      fill="currentColor"
    >
      <path d={claudePath} />
    </svg>
  );
}
