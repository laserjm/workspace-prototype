// What a reply in progress shows of itself. Pure, so it is tested without a browser; it imports
// only types, so it loads none of the components the parts are drawn with.
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";

type Part = WorkspaceUIMessage["parts"][number];

/**
 * Whether the last part shows that the reply is moving on its own: text arriving, or a tool whose
 * card says it is running ("Reading …"). A tool that has answered, the start of a new step,
 * reasoning (never drawn) or empty text shows nothing.
 */
function showsProgress(part: Part): boolean {
  if (part.type === "text") return part.text.trim().length > 0;
  if (part.type.startsWith("tool-") && "state" in part)
    return part.state === "input-streaming" || part.state === "input-available";
  return false;
}

/**
 * Whether a reply that is still working waits for its next step with nothing moving on screen:
 * before anything arrives, and between a tool's answer and what the model does with it. The
 * reply then shows "Thinking…" after its parts.
 */
export function awaitsNextStep(message: WorkspaceUIMessage | undefined): boolean {
  const last = message?.parts.at(-1);
  return !last || !showsProgress(last);
}
