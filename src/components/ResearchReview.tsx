"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveResearchAction } from "@/app/actions/topicRun";
import type { FactView } from "@/lib/dashboard/researchView";
import { FactCard } from "./FactCard";

// 리서치 트리아지 검수(§11) — 에스컬레이션된 fact만 사람이 승인/반려. 기본=승인.
//   반려한 fact는 human_approved=false → 짠펜이 사용 못 함. 검수완료 시 approveResearchAction.
export function ResearchReview({ runId, escalated }: { runId: string; escalated: FactView[] }) {
  const [decisions, setDecisions] = useState<Record<string, "approve" | "reject">>(
    () => Object.fromEntries(escalated.map((f) => [f.id, "approve"])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const approveCount = Object.values(decisions).filter((d) => d === "approve").length;

  function submit() {
    setError(null);
    const approveFactIds = escalated.filter((f) => decisions[f.id] === "approve").map((f) => f.id);
    const rejectFactIds = escalated.filter((f) => decisions[f.id] === "reject").map((f) => f.id);
    startTransition(async () => {
      try {
        await approveResearchAction(runId, { approveFactIds, rejectFactIds });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "검수 승인 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-trus-white/50">
        고위험 fact {escalated.length}건만 검수합니다(나머지 verified·비금융은 자동 통과). 반려한 건은 대본에 쓰이지 않습니다.
      </p>
      {escalated.map((f) => {
        const d = decisions[f.id];
        return (
          <FactCard
            key={f.id}
            fact={f}
            control={
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setDecisions((s) => ({ ...s, [f.id]: "approve" }))}
                  className={`border px-2 py-1 text-[11px] font-bold ${d === "approve" ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/30 text-trus-white/60"}`}
                >
                  승인
                </button>
                <button
                  onClick={() => setDecisions((s) => ({ ...s, [f.id]: "reject" }))}
                  className={`border px-2 py-1 text-[11px] font-bold ${d === "reject" ? "border-trus-white bg-trus-white text-trus-black" : "border-trus-white/30 text-trus-white/60"}`}
                >
                  반려
                </button>
              </div>
            }
          />
        );
      })}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={pending}
          className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {pending ? "처리 중…" : `검수 완료 (승인 ${approveCount}건)`}
        </button>
      </div>
      {error && <p className="text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
