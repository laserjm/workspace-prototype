import { BookOpen, Database, Layers, Workflow } from "lucide-react";

const ICONS: Record<string, typeof Layers> = {
  jira: Layers,
  confluence: BookOpen,
  codebeamer: Workflow,
};

export function SourceIcon({ id }: { id: string }) {
  const Icon = ICONS[id] ?? Database;
  return (
    <span className={`source-mark source-mark-${id}`} aria-hidden>
      <Icon />
    </span>
  );
}
