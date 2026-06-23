"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInsightStatus, updateInsight } from "@/app/actions/insights";
import { nextInsightStatuses, INSIGHT_STATUS_LABEL, INSIGHT_CATEGORY_LABEL, type InsightStatus } from "@/domain/insightStatus";
import type { InsightView } from "@/lib/dashboard/insightsView";

// 인사이트 카드(Phase 4 슬라이스 3) — 회고가 만든 학습 노트 1건. 김짠부가 검토→승인/폐기(+수정).
//   상태 전이 버튼 + 인라인 수정. AI 0회, 상태/내용 변경만(router.refresh로 서버 재조회).

const STATUS_TONE: Record<InsightStatus, string> = {
  draft: "border-trus-white/30 text-trus-white/70",
  reviewed: "border-trus-yellow/50 text-trus-yellow/80",
  approved: "border-trus-yellow text-trus-yellow",
  deprecated: "border-trus-white/20 text-trus-white/40 line-through",
};

export function InsightCard({ insight }: { insight: InsightView }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(insight.title ?? "");
  const [body, setBody] = useState(insight.body ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  const targets = nextInsightStatuses(insight.status);
  const confPct = insight.confidence !== null ? `${Math.round(insight.confidence * 100)}%` : "—";

  return (
    <li className={`border ${STATUS_TONE[insight.status]} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-trus-white/45">
            <span className="border border-trus-white/25 px-1.5 py-0.5 font-bold text-trus-white/70">
              {INSIGHT_CATEGORY_LABEL[insight.category]}
            </span>
            <span>신뢰도 {confPct}</span>
            {insight.sourceLabel && <span className="truncate">← {insight.sourceLabel}</span>}
            {insight.validUntil && <span>~{insight.validUntil.slice(0, 10)}</span>}
          </div>

          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-trus-white/25 bg-transparent px-2 py-1 text-sm font-bold text-trus-white"
                placeholder="한 줄 규칙"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full border border-trus-white/25 bg-transparent px-2 py-1 text-xs text-trus-white/80"
                placeholder="왜 그런지 + 다음에 어떻게 적용할지"
              />
            </div>
          ) : (
            <>
              <h3 className="mt-1.5 text-sm font-bold text-trus-white">{insight.title ?? "(제목 없음)"}</h3>
              {insight.body && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-trus-white/60">{insight.body}</p>}
            </>
          )}
        </div>
        <span className="shrink-0 text-xs font-bold">{INSIGHT_STATUS_LABEL[insight.status]}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              onClick={() => run(async () => { await updateInsight(insight.id, { title, body }); setEditing(false); })}
              disabled={pending}
              className="bg-trus-yellow px-3 py-1 text-xs font-black text-trus-black disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button onClick={() => { setEditing(false); setTitle(insight.title ?? ""); setBody(insight.body ?? ""); }} className="px-3 py-1 text-xs text-trus-white/60 hover:text-trus-white">
              취소
            </button>
          </>
        ) : (
          <>
            {targets.map((to) => (
              <button
                key={to}
                onClick={() => run(() => setInsightStatus(insight.id, to))}
                disabled={pending}
                className={
                  to === "approved"
                    ? "bg-trus-yellow px-3 py-1 text-xs font-black text-trus-black disabled:opacity-50"
                    : "border border-trus-white/25 px-3 py-1 text-xs font-bold text-trus-white/70 hover:border-trus-yellow/50 disabled:opacity-50"
                }
              >
                {to === "approved" ? "승인" : to === "deprecated" ? "폐기" : INSIGHT_STATUS_LABEL[to]}
              </button>
            ))}
            <button onClick={() => setEditing(true)} className="ml-auto px-2 py-1 text-xs text-trus-white/45 hover:text-trus-yellow">
              수정
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </li>
  );
}
