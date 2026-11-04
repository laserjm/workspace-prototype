"use client";

import { ArrowUpRight, CheckCheck } from "lucide-react";
import { SkillIcon, useSkills } from "@/modules/skills";
import {
  countByStatus,
  hasRisk,
  recordCountLabel,
  recordsIn,
  useSources,
} from "@/modules/sources";
import {
  isSampleAnswerable,
  sampleResponseKind,
} from "../domain/sample-response";
import type { ResponseTiming, ThreadScope } from "../domain/thread";
import { ResponseTurn } from "./response-turn";

/** A deterministic answer built from the records in scope (see domain/sample-response.ts). */
export function SampleResponse({
  scope,
  prompt,
  onOpenRecord,
  timing,
  continuation = false,
  onFork,
  skillId,
}: {
  scope: ThreadScope;
  prompt: string;
  onOpenRecord: (id: string) => void;
  timing: ResponseTiming;
  continuation?: boolean;
  onFork: () => void;
  skillId?: string;
}) {
  const source = useSources().sourceById(scope.sourceId);
  const { skillById } = useSkills();
  const records = recordsIn(source, scope.recordIds);
  const scopeLabel = recordCountLabel(source, scope.recordIds.length);
  const mode = sampleResponseKind(prompt, skillId);
  const supported = isSampleAnswerable(prompt, skillId);
  const visible = mode === "risks" ? records.filter(hasRisk) : records;
  return (
    <ResponseTurn
      timing={timing}
      continuation={continuation}
      sourceLabel={`${source.name} · ${scopeLabel}`}
      onFork={onFork}
    >
      <div className="response-read-receipt">
        <CheckCheck size={14} />
        Read {scopeLabel} from {source.name}
        <span>Sample snapshot</span>
      </div>
      {skillId && (
        <div className="response-skill-receipt">
          <SkillIcon id={skillId} />
          {skillById(skillId).name}
          <span>Skill applied</span>
        </div>
      )}
      <h2>
        {mode === "risks"
          ? "What needs attention"
          : mode === "next-steps"
            ? "Recommended next steps"
            : source.overviewTitle}
      </h2>
      <p>
        {mode === "summary"
          ? `Here’s a summary of the ${scopeLabel} selected from ${source.collection}.`
          : mode === "risks"
            ? `${visible.length} of the ${scopeLabel} have a recorded risk or dependency.`
            : `These next steps are based on the ${scopeLabel} in this conversation.`}
      </p>
      {!supported && (
        <p className="response-demo-note">
          This prototype can show summaries, risks, and next steps. Here is the
          sample summary; custom answers need a connected AI provider.
        </p>
      )}
      {mode === "summary" && (
        <div className="response-statuses">
          {countByStatus(records).map(({ status, count }) =>
            count > 0 ? (
              <span key={status}>
                <strong>{count}</strong>
                {status}
              </span>
            ) : null,
          )}
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
                : mode === "next-steps"
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
