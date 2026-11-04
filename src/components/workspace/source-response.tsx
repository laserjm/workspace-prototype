import { ArrowUpRight, CheckCheck } from "lucide-react";
import { ResponseTurn } from "./response-turn";
import type { ResponseTiming } from "./response-timing";
import { getSkill, type SkillId } from "@/lib/workspace/skill-data";
import { SkillIcon } from "./skill-picker";
import {
  getSource,
  getScopedRecords,
  recordStatuses,
  scopeLabel,
  type SourceScope,
} from "@/lib/workspace/source-data";

export function SourceResponse({
  scope,
  prompt,
  onOpenRecord,
  timing,
  continuation = false,
  onFork,
  skillId,
}: {
  scope: SourceScope;
  prompt: string;
  onOpenRecord: (id: string) => void;
  timing: ResponseTiming;
  continuation?: boolean;
  onFork: () => void;
  skillId?: SkillId;
}) {
  const source = getSource(scope.sourceId);
  const records = getScopedRecords(scope);
  const mode =
    skillId === "risk-review"
      ? "risks"
      : skillId === "action-plan"
        ? "actions"
        : skillId === "summary"
          ? "summary"
          : /risk|block|attention/i.test(prompt)
            ? "risks"
            : /next|action|follow.?up/i.test(prompt)
              ? "actions"
              : "summary";
  const supported =
    skillId ||
    /summ[ar]+y|summar|overview|risk|block|attention|next|action|follow.?up/i.test(
      prompt,
    );
  const visible =
    mode === "risks" ? records.filter((record) => record.risk) : records;
  return (
    <ResponseTurn
      timing={timing}
      continuation={continuation}
      label="Sample assistant response"
      details={[
        { label: "Source", value: `${source.name} · ${scopeLabel(scope)}` },
      ]}
      note="Sample response prepared locally from the selected records. No AI provider was used for this response."
      preparingLabel={`Preparing a sample response from ${source.name} · ${scopeLabel(scope)}…`}
      onFork={onFork}
    >
      <div className="response-read-receipt">
        <CheckCheck size={14} />
        Read {scopeLabel(scope)} from {source.name}
        <span>Sample snapshot</span>
      </div>
      {skillId && (
        <div className="response-skill-receipt">
          <SkillIcon id={skillId} />
          {getSkill(skillId).name}
          <span>Skill applied</span>
        </div>
      )}
      <h2>
        {mode === "risks"
          ? "What needs attention"
          : mode === "actions"
            ? "Recommended next steps"
            : source.id === "jira"
              ? "Sprint 24 at a glance"
              : source.id === "confluence"
                ? "Platform knowledge at a glance"
                : "Release 2.4 at a glance"}
      </h2>
      <p>
        {mode === "summary"
          ? `Here’s a summary of the ${scopeLabel(scope)} selected from ${source.collection}.`
          : mode === "risks"
            ? `${visible.length} of the ${scopeLabel(scope)} have a recorded risk or dependency.`
            : `These next steps are based on the ${scopeLabel(scope)} in this conversation.`}
      </p>
      {!supported && (
        <p className="response-demo-note">
          This prototype can show summaries, risks, and next steps. Here is the
          sample summary; custom answers need a connected AI provider.
        </p>
      )}
      {mode === "summary" && (
        <div className="response-statuses">
          {recordStatuses.map((status) => {
            const count = records.filter(
              (record) => record.status === status,
            ).length;
            return count > 0 ? (
              <span key={status}>
                <strong>{count}</strong>
                {status}
              </span>
            ) : null;
          })}
        </div>
      )}
      <div className="response-items">
        {visible.map((record) => (
          <div className="response-item" key={record.id}>
            <button
              type="button"
              className="record-citation"
              onClick={() => onOpenRecord(record.id)}
              aria-label={`View source ${record.id}`}
            >
              {record.id}
              <ArrowUpRight size={11} />
            </button>
            <h3>{record.title}</h3>
            <p>
              {mode === "risks"
                ? record.risk
                : mode === "actions"
                  ? record.nextStep
                  : record.summary}
            </p>
          </div>
        ))}
      </div>
      {mode === "risks" && visible.length === 0 && (
        <p>No risks are recorded in these sample records.</p>
      )}
      <div className="response-conclusion">
        <strong>
          {mode === "summary" ? "Suggested follow-up" : "Source scope"}
        </strong>
        <p>
          {mode === "summary"
            ? "Ask “What are the risks?” or “What are the next steps?” to explore this snapshot further."
            : "This response uses only the selected records. Open a citation to inspect the source details."}
        </p>
      </div>
    </ResponseTurn>
  );
}
