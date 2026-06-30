"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewScriptAction, requestScriptReworkAction } from "@/app/actions/topicRun";
import type { SegmentView, SegmentFactView } from "@/lib/dashboard/scriptView";
import { VERIFICATION_LABEL } from "@/lib/dashboard/labels";
import { SegmentBody } from "./SegmentList";
import { safeHref } from "./FactCard";

// 대본 최종 게이트(autoflow §D) — 본문 + 인라인 fact 칩으로 한 화면에서 검수한다.
//   보류(pending) fact만 승인/반려 토글(기본=승인) — ResearchReview decisions 패턴 미러.
//   verified는 출처만, 그 외 비보류는 '미검증' 가벼운 표식. 반려는 전체 재작성(step0 백엔드 정책).
//   주 동선: reviewScriptAction(rejectFactIds). 보조: requestScriptReworkAction(통째 재작성).
export function ScriptReview({ runId, segments }: { runId: string; segments: SegmentView[] }): React.JSX.Element {
  // 보류 fact id → 결정(승인/반려). 기본=승인.
  const pendingFacts = segments.flatMap((s) => s.facts.filter((f) => f.pending));
  const [decisions, setDecisions] = useState<Record<string, "approve" | "reject">>(
    () => Object.fromEntries(pendingFacts.map((f) => [f.id, "approve"])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const rejectFactIds = pendingFacts.filter((f) => decisions[f.id] === "reject").map((f) => f.id);
  const hasReject = rejectFactIds.length > 0;

  function submit() {
    // 반려가 있으면 전체 재작성(짠펜 재실행·비용) 확인. 없으면 바로 승인.
    if (hasReject && !window.confirm("반려한 사실을 뺀 대본으로 다시 씁니다 — 짠펜 재실행, 운영 시 비용. 진행할까요?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await reviewScriptAction(runId, { rejectFactIds });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "검수 실패");
      }
    });
  }

  function rework() {
    if (!window.confirm("대본을 통째로 다시 쓰게 합니다(짠펜 재실행, 운영 시 비용 발생). max_rework 초과 시 자동 중단됩니다. 진행할까요?")) return;
    setError(null);
    startTransition(async () => {
      try {
        await requestScriptReworkAction(runId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수정요청 실패");
      }
    });
  }

  function setDecision(id: string, d: "approve" | "reject") {
    setDecisions((s) => ({ ...s, [id]: d }));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-trus-white/60">
        완성된 대본입니다. 본문에 쓰인 사실의 출처를 확인하세요. {pendingFacts.length > 0
          ? `확인 필요 ${pendingFacts.length}건은 기본 승인 — 반려하면 그 사실을 뺀 대본으로 다시 씁니다.`
          : "확인이 필요한 사실은 없습니다."}
      </p>

      <div className="flex flex-col gap-3">
        {segments.map((s) => (
          <div key={s.id} className="border border-trus-white/15 p-4">
            <div className="flex items-start gap-3">
              <span className="text-trus-yellow shrink-0 text-sm font-black">{s.ord + 1}</span>
              <SegmentBody segment={s} />
            </div>
            {s.facts.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-trus-white/10 pt-2">
                {s.facts.map((f) => (
                  <FactChip key={f.id} fact={f} decision={decisions[f.id]} onDecision={setDecision} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {pending ? "처리 중…" : hasReject ? `반려 ${rejectFactIds.length}건 반영해 다시 쓰기` : "최종 승인"}
        </button>
        <button
          onClick={rework}
          disabled={pending}
          className="border border-trus-white/30 px-5 py-2 text-sm font-bold text-trus-white/80 hover:border-trus-yellow disabled:opacity-50"
        >
          수정 요청
        </button>
      </div>
      {error && <p className="text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}

// 인라인 fact 칩 — SegmentFactView(FactView 서브셋)용 경량 칩. FactCard는 타입 불일치라 재사용 불가.
//   보류: 승인/반려 토글(기본 승인) + '확인 필요'. verified: 출처만. 그 외 비보류: '미검증' 가벼운 표식.
function FactChip({
  fact,
  decision,
  onDecision,
}: {
  fact: SegmentFactView;
  decision: "approve" | "reject" | undefined;
  onDecision: (id: string, d: "approve" | "reject") => void;
}): React.JSX.Element {
  const href = safeHref(fact.primarySourceUrl);
  const verified = fact.verificationStatus === "verified";
  // 보류 칩은 좌측 보더를 노랗게 — 단락이 여러 개여도 '확인할 곳'이 한눈에 스캔된다(verified/미검증은 평이하게).
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-2 border border-trus-white/15 px-2.5 py-1.5 text-[11px] ${
        fact.pending ? "border-l-2 border-l-trus-yellow" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline gap-1">
          {fact.pending ? (
            <span className="shrink-0 border border-trus-yellow px-1 py-0.5 text-[10px] font-bold text-trus-yellow">확인 필요</span>
          ) : (
            !verified && (
              <span className="shrink-0 border border-trus-white/30 px-1 py-0.5 text-[10px] font-bold text-trus-white/50">
                {VERIFICATION_LABEL[fact.verificationStatus]}
              </span>
            )
          )}
          <span className="min-w-0 text-trus-white/80">{fact.claim}</span>
        </span>
        {/* 출처: http/https만 링크(safeHref). url 없으면 표식 생략(방어). */}
        {fact.primarySourceUrl &&
          (href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={fact.primarySourceUrl}
              className="truncate text-[10px] text-trus-white/40 underline hover:text-trus-yellow"
            >
              {fact.primarySourceUrl}
            </a>
          ) : (
            <span title={fact.primarySourceUrl} className="truncate text-[10px] text-trus-white/30">
              {fact.primarySourceUrl}
            </span>
          ))}
      </div>
      {/* 토글은 보류 fact에만. 비보류는 표시만(차단 아님). */}
      {fact.pending && (
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onDecision(fact.id, "approve")}
            className={`border px-2 py-0.5 text-[10px] font-bold ${decision === "approve" ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/30 text-trus-white/60"}`}
          >
            승인
          </button>
          <button
            onClick={() => onDecision(fact.id, "reject")}
            className={`border px-2 py-0.5 text-[10px] font-bold ${decision === "reject" ? "border-trus-white bg-trus-white text-trus-black" : "border-trus-white/30 text-trus-white/60"}`}
          >
            반려
          </button>
        </div>
      )}
    </div>
  );
}
