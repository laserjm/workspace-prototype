import { ListChecks, ScanLine, Wrench } from "lucide-react";

const ICONS: Record<string, typeof Wrench> = {
  "risk-review": ScanLine,
  "action-plan": ListChecks,
};

export function SkillIcon({ id }: { id?: string }) {
  const Icon = (id && ICONS[id]) || Wrench;
  return <Icon aria-hidden />;
}
