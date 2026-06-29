"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectResearchScopeAction } from "@/app/actions/topicRun";
import type { ScopeCandidateView } from "@/lib/dashboard/researchView";

// 리서치 스코프 게이트(§8.1 사람 게이트) — 셜록이 뽑은 검증 후보를 섹션별로 보여주고,
//   사용자가 체크한 항목만 검증으로 보낸다. 후보는 절대 안 자르고 전부 표시(사용자가 선택).
//   금융 항목은 ⚠️로 "검수 대상 예고" — 선택 시 나중에 사람 검수로 감.
//   비용은 선택 개수에 비례 → 선택 N개를 하단에 명시(많을수록 비용↑).

const SECTION_FALLBACK = "기타";

// 작은 배지 — FactCard와 동일 톤(border + 미세 텍스트).
function Tag({ children, on = false }: { children: React.ReactNode; on?: boolean }) {
  return (
    <span
      className={`border px-1.5 py-0.5 text-[10px] font-bold ${on ? "border-trus-yellow text-trus-yellow" : "border-trus-white/20 text-trus-white/45"}`}
    >
      {children}
    </span>
  );
}

export function ResearchScopeGate({
  runId,
  proposalId,
  candidates,
}: {
  runId: string;
  proposalId: string;
  candidates: ScopeCandidateView[];
}) {
  // 초기 선택 = defaultSelected 힌트(중요도 상위). 사용자가 체크박스로 더하거나 뺀다.
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(candidates.filter((c) => c.defaultSelected).map((c) => c.idx)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 섹션별 그룹핑(목차 한눈에). section이 null인 건 마지막 "기타" 그룹으로.
  //   섹션 등장 순서를 보존 → 후보 배열 순서가 곧 목차 순서.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ScopeCandidateView[]>();
    for (const c of candidates) {
      const key = c.section ?? SECTION_FALLBACK;
      if (!map.has(key)) {
        map.set(key, []);
        if (key !== SECTION_FALLBACK) order.push(key);
      }
      map.get(key)!.push(c);
    }
    // null("기타")은 항상 맨 뒤로.
    if (map.has(SECTION_FALLBACK)) order.push(SECTION_FALLBACK);
    return order.map((section) => ({ section, items: map.get(section)! }));
  }, [candidates]);

  const selectedCount = selected.size;

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setError(null);
  }

  function submit() {
    if (selectedCount === 0) return; // 최소 1개(버튼도 비활성이지만 이중 가드).
    setError(null);
    // 선택 idx를 kind 기준으로 claims/concepts 전역 idx 배열로 분리.
    const claims: number[] = [];
    const concepts: number[] = [];
    for (const c of candidates) {
      if (!selected.has(c.idx)) continue;
      if (c.kind === "claim") claims.push(c.idx);
      else concepts.push(c.idx);
    }
    startTransition(async () => {
      try {
        await selectResearchScopeAction(runId, proposalId, { claims, concepts });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "리서치 시작 실패");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ section, items }) => (
        <div key={section} className="flex flex-col gap-2">
          <h4 className="text-xs font-black tracking-widest text-trus-white/70 uppercase">{section}</h4>
          <div className="flex flex-col gap-2">
            {items.map((c) => {
              const checked = selected.has(c.idx);
              return (
                <button
                  key={c.idx}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(c.idx)}
                  className={`block w-full border p-3 text-left hover:bg-trus-white/[0.03] focus:outline-none focus-visible:border-trus-yellow ${checked ? "border-trus-yellow" : "border-trus-white/20"}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-black ${checked ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/40 text-trus-white/40"}`}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-trus-white">{c.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Tag on={c.kind === "claim"}>{c.kind === "claim" ? "주장" : "개념"}</Tag>
                        {c.isFinancial && <Tag on>⚠️ 검수 대상 예고</Tag>}
                        {c.needsNumber && <Tag>숫자 예시 필요</Tag>}
                        {c.needsAnalogy && <Tag>비유 필요</Tag>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="border border-trus-yellow/40 p-4">
        <p className="text-sm font-bold text-trus-white">
          선택 <span className="text-trus-yellow">{selectedCount}개</span> 검증 예정
        </p>
        <p className="mt-1 text-xs text-trus-white/50">
          고른 항목만 출처확인·교차검증합니다. 많이 고를수록 검증 비용·시간이 늘어납니다. (금융 ⚠️ 항목은 사람 검수로 이어집니다.)
        </p>
        <button
          onClick={submit}
          disabled={pending || selectedCount === 0}
          className="mt-4 bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black disabled:opacity-50"
        >
          {pending ? "리서치 시작 중…" : "이 항목들로 리서치 시작"}
        </button>
        {selectedCount === 0 && !pending && (
          <p className="mt-2 text-xs text-trus-white/50">검증할 항목을 최소 1개 골라주세요.</p>
        )}
        {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
      </div>
    </div>
  );
}
