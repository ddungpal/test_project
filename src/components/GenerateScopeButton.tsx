"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateResearchScopeAction } from "@/app/actions/topicRun";

// research_scoped 인데 검증 후보가 0개(셜록 scope 미생성·stale)일 때의 복구 버튼.
//   "불러오는 중" 막다른 화면 대신 셜록에게 후보를 생성하게 한다(regenerateResearchScope 재사용 — 동기·$0/claude-p).
//   완료 후 router.refresh로 게이트(ResearchScopeGate)가 후보와 함께 뜬다.
export function GenerateScopeButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-trus-white/40">
        검증 후보가 아직 없습니다. 셜록에게 후보(검증할 주장·개념)를 생성하게 하세요.
      </p>
      <button
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              await regenerateResearchScopeAction(runId);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "후보 생성 실패");
            }
          })
        }
        disabled={pending}
        className="self-start border border-trus-yellow/50 px-5 py-2.5 text-sm font-bold text-trus-yellow hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
      >
        {pending ? "셜록이 후보 생성 중…" : "셜록 후보 생성하기"}
      </button>
      {error && <p className="text-xs font-bold text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
