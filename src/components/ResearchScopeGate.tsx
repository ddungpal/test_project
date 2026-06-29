"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateResearchScopeAction,
  selectResearchScopeAction,
} from "@/app/actions/topicRun";
import type { ScopeCandidateView } from "@/lib/dashboard/researchView";
import { detectFinancial } from "@/pipeline/financialHeuristic";

// 리서치 스코프 게이트(§8.1 사람 게이트) — 셜록이 뽑은 검증 후보를 섹션별로 보여주고,
//   사용자가 체크한 항목만 검증으로 보낸다. 후보는 절대 안 자르고 전부 표시(사용자가 선택).
//   금융 항목은 ⚠️로 "검수 대상 예고" — 선택 시 나중에 사람 검수로 감.
//   비용은 선택 개수에 비례 → 선택 N개를 하단에 명시(많을수록 비용↑).
//   step3 보강: (a)더 뽑아줘(재생성) + (b)직접 추가(수동 claim/concept) — 수동은 후보를 변형하지 않고
//     selectResearchScopeAction의 manual 인자로 함께 보낸다.

const SECTION_FALLBACK = "기타";

// 수동 추가 항목(클라 로컬 상태). 제출 시 ManualClaim/ManualConcept로 매핑.
type ManualClaimDraft = {
  id: number;
  text: string;
  isFinancial: boolean;
  section: string; // "" = 미지정
  selected: boolean;
};
type ManualConceptDraft = {
  id: number;
  name: string;
  needsNumber: boolean;
  needsAnalogy: boolean;
  section: string;
  selected: boolean;
};

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

  // (a) 더 뽑아줘(재생성) — 이유 입력(선택) + 버튼. 완료 감지는 router.refresh로 단순화(이 컴포넌트엔 proposalId 단일).
  const [reason, setReason] = useState("");
  const [regenPending, startRegen] = useTransition();
  const reasonId = useId();

  // (b) 직접 추가(수동) — claim/concept 드래프트. id는 단조 증가 카운터로 부여.
  const [nextId, setNextId] = useState(1);
  const [manualClaims, setManualClaims] = useState<ManualClaimDraft[]>([]);
  const [manualConcepts, setManualConcepts] = useState<ManualConceptDraft[]>([]);
  const [claimDraft, setClaimDraft] = useState("");
  // 입력 중 claim의 금융 토글 — 미수정(claimFinTouched=false)이면 타이핑 시 detectFinancial을 자동 따라가고,
  //   사용자가 직접 토글하면(true) 그 값으로 고정. 추가하면 그 값이 항목으로 들어간다.
  const [claimFin, setClaimFin] = useState(false);
  const [claimFinTouched, setClaimFinTouched] = useState(false);
  const [conceptDraft, setConceptDraft] = useState("");

  // 입력 중 자동 금융판정 — 사용자가 토글을 만지지 않았을 때만 detectFinancial을 따라간다.
  const claimDraftFinancial = claimFinTouched ? claimFin : detectFinancial(claimDraft);

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

  // 수동 항목 섹션 선택지 — 후보에 등장한 실제 섹션들(null 제외, 등장순·중복제거).
  const sectionOptions = useMemo(() => {
    const seen: string[] = [];
    for (const c of candidates) {
      if (c.section && !seen.includes(c.section)) seen.push(c.section);
    }
    return seen;
  }, [candidates]);

  // 선택 합산 = 후보 체크 + 수동(선택된 것). 0이면 제출 비활성.
  const manualSelectedCount =
    manualClaims.filter((m) => m.selected).length + manualConcepts.filter((m) => m.selected).length;
  const selectedCount = selected.size + manualSelectedCount;

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
    setError(null);
  }

  // (a) 더 뽑아줘 — 새 후보를 INSERT(전이 없음). 완료 후 router.refresh로 새 proposal 반영.
  function regenerate() {
    setError(null);
    startRegen(async () => {
      try {
        await regenerateResearchScopeAction(runId, reason.trim() || undefined);
        setReason("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "후보 추가 생성 실패");
      }
    });
  }

  // (b) claim 추가 — 텍스트 입력값으로 드래프트 생성. 금융 토글 초기값 = detectFinancial 자동판정.
  function addClaim() {
    const text = claimDraft.trim();
    if (!text) return;
    setManualClaims((prev) => [
      ...prev,
      { id: nextId, text, isFinancial: claimDraftFinancial, section: "", selected: true },
    ]);
    setNextId((n) => n + 1);
    setClaimDraft("");
    setClaimFin(false);
    setClaimFinTouched(false);
    setError(null);
  }
  function addConcept() {
    const name = conceptDraft.trim();
    if (!name) return;
    setManualConcepts((prev) => [
      ...prev,
      { id: nextId, name, needsNumber: false, needsAnalogy: false, section: "", selected: true },
    ]);
    setNextId((n) => n + 1);
    setConceptDraft("");
    setError(null);
  }

  function submit() {
    if (selectedCount === 0) return; // 최소 1개(버튼도 비활성이지만 이중 가드).
    setError(null);
    // 후보 체크 idx를 kind 기준으로 claims/concepts 전역 idx 배열로 분리.
    const claims: number[] = [];
    const concepts: number[] = [];
    for (const c of candidates) {
      if (!selected.has(c.idx)) continue;
      if (c.kind === "claim") claims.push(c.idx);
      else concepts.push(c.idx);
    }
    // 수동 항목(선택된 것만) → ManualClaim/ManualConcept. section 공란은 미전송(undefined).
    const manualClaimPayload = manualClaims
      .filter((m) => m.selected)
      .map((m) => ({ text: m.text, is_financial: m.isFinancial, ...(m.section ? { section: m.section } : {}) }));
    const manualConceptPayload = manualConcepts
      .filter((m) => m.selected)
      .map((m) => ({
        name: m.name,
        needs_number: m.needsNumber,
        needs_analogy: m.needsAnalogy,
        ...(m.section ? { section: m.section } : {}),
      }));
    const manual =
      manualClaimPayload.length || manualConceptPayload.length
        ? {
            ...(manualClaimPayload.length ? { claims: manualClaimPayload } : {}),
            ...(manualConceptPayload.length ? { concepts: manualConceptPayload } : {}),
          }
        : undefined;
    startTransition(async () => {
      try {
        await selectResearchScopeAction(runId, proposalId, { claims, concepts }, manual);
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

      {/* 사용자 추가분 — 후보 목록과 같은 톤으로, 직접 추가한 항목을 ✓ 기본선택·삭제 가능하게 표시. */}
      {(manualClaims.length > 0 || manualConcepts.length > 0) && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-black tracking-widest text-trus-yellow uppercase">사용자 추가분</h4>
          <div className="flex flex-col gap-2">
            {manualClaims.map((m) => (
              <div
                key={`mc-${m.id}`}
                className={`block w-full border p-3 text-left ${m.selected ? "border-trus-yellow" : "border-trus-white/20"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={m.selected}
                    aria-label="선택 토글"
                    onClick={() =>
                      setManualClaims((prev) => prev.map((x) => (x.id === m.id ? { ...x, selected: !x.selected } : x)))
                    }
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-black ${m.selected ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/40 text-trus-white/40"}`}
                  >
                    {m.selected ? "✓" : ""}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-trus-white">{m.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Tag on>주장</Tag>
                      {m.isFinancial && <Tag on>⚠️ 검수 대상 예고</Tag>}
                      <Tag>사용자 추가분</Tag>
                      {/* 금융 토글 — 자동판정 초기값을 사용자가 직접 켜고 끌 수 있다(만지면 고정). */}
                      <label className="flex items-center gap-1 text-[10px] font-bold text-trus-white/60">
                        <input
                          type="checkbox"
                          checked={m.isFinancial}
                          onChange={(e) =>
                            setManualClaims((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, isFinancial: e.target.checked } : x)),
                            )
                          }
                          className="accent-trus-yellow"
                        />
                        금융
                      </label>
                      {/* 섹션 선택(선택) — 후보에 등장한 섹션 중 하나거나 공란. */}
                      {sectionOptions.length > 0 && (
                        <select
                          value={m.section}
                          onChange={(e) =>
                            setManualClaims((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, section: e.target.value } : x)),
                            )
                          }
                          className="border border-trus-white/20 bg-trus-black px-1 py-0.5 text-[10px] text-trus-white/70"
                        >
                          <option value="">섹션 없음</option>
                          {sectionOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualClaims((prev) => prev.filter((x) => x.id !== m.id))}
                    className="shrink-0 border border-trus-white/30 px-2 py-0.5 text-[10px] font-bold text-trus-white/60 hover:border-trus-yellow hover:text-trus-yellow"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
            {manualConcepts.map((m) => (
              <div
                key={`mco-${m.id}`}
                className={`block w-full border p-3 text-left ${m.selected ? "border-trus-yellow" : "border-trus-white/20"}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={m.selected}
                    aria-label="선택 토글"
                    onClick={() =>
                      setManualConcepts((prev) => prev.map((x) => (x.id === m.id ? { ...x, selected: !x.selected } : x)))
                    }
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-xs font-black ${m.selected ? "border-trus-yellow bg-trus-yellow text-trus-black" : "border-trus-white/40 text-trus-white/40"}`}
                  >
                    {m.selected ? "✓" : ""}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-trus-white">{m.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Tag>개념</Tag>
                      <Tag>사용자 추가분</Tag>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-trus-white/60">
                        <input
                          type="checkbox"
                          checked={m.needsNumber}
                          onChange={(e) =>
                            setManualConcepts((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, needsNumber: e.target.checked } : x)),
                            )
                          }
                          className="accent-trus-yellow"
                        />
                        숫자 예시 필요
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-bold text-trus-white/60">
                        <input
                          type="checkbox"
                          checked={m.needsAnalogy}
                          onChange={(e) =>
                            setManualConcepts((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, needsAnalogy: e.target.checked } : x)),
                            )
                          }
                          className="accent-trus-yellow"
                        />
                        비유 필요
                      </label>
                      {sectionOptions.length > 0 && (
                        <select
                          value={m.section}
                          onChange={(e) =>
                            setManualConcepts((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, section: e.target.value } : x)),
                            )
                          }
                          className="border border-trus-white/20 bg-trus-black px-1 py-0.5 text-[10px] text-trus-white/70"
                        >
                          <option value="">섹션 없음</option>
                          {sectionOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualConcepts((prev) => prev.filter((x) => x.id !== m.id))}
                    className="shrink-0 border border-trus-white/30 px-2 py-0.5 text-[10px] font-bold text-trus-white/60 hover:border-trus-yellow hover:text-trus-yellow"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* (b) 직접 추가 폼 — claim/concept 입력. 추가하면 위 "사용자 추가분"에 ✓로 들어간다. */}
      <div className="border border-trus-white/15 p-4">
        <p className="text-xs font-black tracking-widest text-trus-white/70 uppercase">직접 추가</p>
        <p className="mt-1 text-xs text-trus-white/50">셜록이 놓친 주장·개념을 직접 더할 수 있습니다. 추가하면 자동 선택됩니다.</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={claimDraft}
              onChange={(e) => setClaimDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addClaim();
                }
              }}
              placeholder="검증할 주장 (예: ISA 비과세 한도는 200만원)"
              className="min-w-0 flex-1 border border-trus-white/20 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
            />
            {/* 금융 토글 — 미수정이면 타이핑에 따라 자동(detectFinancial), 직접 만지면 고정. */}
            <label className="flex items-center gap-1 text-xs font-bold text-trus-white/60">
              <input
                type="checkbox"
                checked={claimDraftFinancial}
                onChange={(e) => {
                  setClaimFin(e.target.checked);
                  setClaimFinTouched(true);
                }}
                className="accent-trus-yellow"
              />
              금융
            </label>
            <button
              type="button"
              onClick={addClaim}
              disabled={!claimDraft.trim()}
              className="border border-trus-yellow/50 px-4 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              주장 추가
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={conceptDraft}
              onChange={(e) => setConceptDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addConcept();
                }
              }}
              placeholder="설명할 개념 (예: 복리)"
              className="min-w-0 flex-1 border border-trus-white/20 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow"
            />
            <button
              type="button"
              onClick={addConcept}
              disabled={!conceptDraft.trim()}
              className="border border-trus-yellow/50 px-4 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              개념 추가
            </button>
          </div>
        </div>
      </div>

      {/* (a) 더 뽑아줘 — 셜록이 후보를 더 생성. 이유 입력은 선택. */}
      <div className="border border-trus-white/15 p-4">
        <label htmlFor={reasonId} className="block text-xs font-bold text-trus-white/60">
          더 뽑아줘 — 추가 생성 이유 (선택)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={regenPending}
          rows={2}
          placeholder="어떤 후보가 더 필요한가요? (선택) 예: 세금 관련 주장을 더"
          className="mt-1.5 mb-2 block w-full max-w-md resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
        />
        <button
          type="button"
          onClick={regenerate}
          disabled={regenPending}
          className="border border-trus-yellow/50 px-5 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
        >
          {regenPending ? "더 뽑는 중…" : "더 뽑아줘"}
        </button>
      </div>

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
