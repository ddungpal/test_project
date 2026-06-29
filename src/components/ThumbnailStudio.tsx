"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateThumbnails, regenerateThumbnailSlot, confirmThumbnails } from "@/app/actions/topicRun";
import { saveCorrection, analyzeCorrectionDiff } from "@/app/actions/copyLearn";
import { extractGenCopy } from "@/components/thumbnailCorrectionGen";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CandidateBody } from "@/components/CandidateBody";
import { CandidateSourceBadge } from "@/components/CandidateSourceBadge";
import { candidateKey, resolveCompletedSlots, clearSlots } from "@/components/thumbnailRegenQueue";
import type { CandidateView } from "@/lib/dashboard/proposalTypes";
import type { CorrectionDiff } from "@/agents/correction_diff/schema";

// 썸네일 스튜디오(§8.1 사람 게이트) — A/B/C 3개를 보고 ① 개별 칸 다시 생성 ② 3개 전체 다시 생성 ③ 3개로 확정.
//   ★ 슬롯 재생성은 '비차단 큐' — 한 칸을 다시 생성하는 동안 다른 칸도 누를 수 있다. 진행 중 슬롯은 pending(idx→스냅샷)에
//     담고, 폴링으로 새 후보가 도착하면 step0 resolveCompletedSlots(payload 내용 비교)로 '바뀐 슬롯=완료'를 판정해 비운다.
//     ★ 완료 판정을 candidate id로 하지 않는다 — id는 재생성마다 새로 생겨 보존 슬롯도 '바뀐 것'처럼 보인다(thumbnailRegenQueue.ts).
//   고정 cutoff을 '완료 판정'으로 쓰지 않는다(opus는 3분+ 걸림). 안전 상한만 5분으로 두고, 진짜 종료는 payload 변경으로 감지.
const POLL_LIMIT_MS = 300000; // 5분(안전망). 정상 종료는 payload 변경(resolveCompletedSlots)이 담당.

// 카드별 교정 학습 상태 — idx로 키잉. 저장(saveCorrection)→분석(analyzeCorrectionDiff)은 재생성/확정과
//   완전히 독립이다(상태 전이 없음·proposalId 폴링 무관). 그래서 별도 transition·busy·error로 분리한다.
type CorrectionCardState = {
  idealMain: string[]; // 이상 메인 입력 2칸
  idealBoxes: string[]; // 이상 박스 입력 2칸
  busy: boolean; // 저장+분석 진행 중
  error: string | null;
  correctionId: string | null; // 저장된 교정쌍 id(성공 표시)
  diff: CorrectionDiff | null; // 분석 결과(인라인 표시)
};

const EMPTY_CORRECTION: CorrectionCardState = {
  idealMain: ["", ""],
  idealBoxes: ["", ""],
  busy: false,
  error: null,
  correctionId: null,
  diff: null,
};

export function ThumbnailStudio({
  runId,
  candidates,
  topic,
}: {
  runId: string;
  candidates: CandidateView[];
  topic: string;
}) {
  const [error, setError] = useState<string | null>(null);
  // 슬롯별 비차단 큐 — 진행 중 슬롯idx → 큐 투입 시점 candidateKey 스냅샷. 한 슬롯이 대기 중이어도 다른 슬롯 클릭을 막지 않는다.
  const [pending, setPending] = useState<Record<number, string>>({});
  const [confirmBusy, setConfirmBusy] = useState(false); // 확정(상태 전이)만 전체 잠금. 슬롯 큐와는 별도 결.
  const [timedOut, setTimedOut] = useState(false);
  const [allReason, setAllReason] = useState(""); // 전체 다시 생성 공용 사유(선택). 비/공백이면 백엔드에서 미전송.
  const [slotReasons, setSlotReasons] = useState<Record<number, string>>({}); // 카드별 사유(선택). idx→reason.
  const allReasonId = useId();
  const slotReasonBaseId = useId();
  // ★ transition pending(isSubmitting)은 표시용이 아니라 서버액션 호출 래핑용일 뿐 — 버튼 disable에 쓰지 않는다(비차단 보존).
  const [, startTransition] = useTransition();
  const router = useRouter();
  const hasPending = Object.keys(pending).length > 0;

  // ── 교정 학습(독립 경로) — 재생성/확정의 pending·confirmBusy 폴링과 절대 섞지 않는다.
  //    교정은 상태 전이 없는 저장+분석일 뿐 → 후보·런 상태를 바꾸지 않고, 재생성 잠금(disabledGlobal/slotDisabled)에 묶이지 않는다.
  const correctionBaseId = useId();
  const [, startCorrectionTransition] = useTransition();
  const [corrections, setCorrections] = useState<Record<number, CorrectionCardState>>({});
  const corrState = (idx: number): CorrectionCardState => corrections[idx] ?? EMPTY_CORRECTION;
  function patchCorrection(idx: number, patch: Partial<CorrectionCardState>) {
    setCorrections((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? EMPTY_CORRECTION), ...patch } }));
  }
  function setIdealField(idx: number, field: "idealMain" | "idealBoxes", slot: 0 | 1, value: string) {
    setCorrections((prev) => {
      const cur = prev[idx] ?? EMPTY_CORRECTION;
      const arr = [...cur[field]];
      arr[slot] = value;
      return { ...prev, [idx]: { ...cur, [field]: arr } };
    });
  }
  // 이상 입력이 메인·박스 통틀어 전부 빈칸이면 교정 불가(가드용).
  function hasIdeal(s: CorrectionCardState): boolean {
    return [...s.idealMain, ...s.idealBoxes].some((v) => v.trim().length > 0);
  }
  // 교정 저장→분석. gen 은 그 후보의 실제 카피(payload에서 추출 — 사용자가 다시 입력하지 않는다).
  function runCorrection(c: CandidateView) {
    const cur = corrState(c.idx);
    if (!hasIdeal(cur)) return;
    const gen = extractGenCopy(c.payload);
    const idealMain = cur.idealMain.map((v) => v.trim()).filter(Boolean);
    const idealBoxes = cur.idealBoxes.map((v) => v.trim()).filter(Boolean);
    patchCorrection(c.idx, { busy: true, error: null, correctionId: null, diff: null });
    startCorrectionTransition(async () => {
      try {
        const { id } = await saveCorrection({
          componentType: "thumbnail",
          topic,
          genMain: gen.main,
          genBoxes: gen.boxes,
          idealMain,
          idealBoxes,
        });
        const { diff } = await analyzeCorrectionDiff(id);
        patchCorrection(c.idx, { busy: false, correctionId: id, diff });
      } catch (e) {
        patchCorrection(c.idx, { busy: false, error: e instanceof Error ? e.message : "교정 저장/분석 실패" });
      }
    });
  }

  // 완료 감지 — 폴링으로 새 후보(candidates)가 도착하면, pending 슬롯 중 payload가 '바뀐' 슬롯만 완료로 보고 비운다(step0).
  //   ★ candidate id가 아니라 payload 내용 비교(resolveCompletedSlots) — 보존 슬롯(같은 payload)은 완료로 치지 않아 비차단이 안 깨진다.
  useEffect(() => {
    if (Object.keys(pending).length === 0) return;
    const completed = resolveCompletedSlots(pending, candidates);
    if (completed.length === 0) return;
    setPending((prev) => clearSlots(prev, completed));
    setTimedOut(false);
    // 완료된 슬롯의 사유칸만 비운다(다음 입력 준비). 대기 중인 다른 슬롯 사유는 보존.
    setSlotReasons((prev) => {
      const next = { ...prev };
      for (const idx of completed) delete next[idx];
      return next;
    });
  }, [candidates, pending]);

  // 안전 상한 — 워커 실패·payload 우연 동일로 영영 pending이 안 비면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!hasPending) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [hasPending]);

  // 슬롯 재생성 — 해당 슬롯만 pending에 스냅샷(candidateKey)으로 넣고 호출·폴링. ★ 다른 슬롯이 대기 중이어도 막지 않는다(비차단).
  function runSlotRegen(idx: number) {
    setError(null);
    const snapshot = candidateKey(candidates[idx]?.payload);
    setPending((prev) => ({ ...prev, [idx]: snapshot }));
    startTransition(async () => {
      try {
        await regenerateThumbnailSlot(runId, idx, slotReasons[idx]);
        router.refresh();
      } catch (e) {
        setPending((prev) => clearSlots(prev, [idx])); // 실패 시 그 슬롯만 큐에서 뺀다(다른 대기 슬롯은 유지).
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  // 전체 재생성 — 3슬롯 전부 candidateKey 스냅샷을 pending에 넣고 호출(전체도 같은 큐 모델로 통일).
  function runAllRegen(fn: () => Promise<void>) {
    setError(null);
    const snapshot: Record<number, string> = {};
    for (const c of candidates) snapshot[c.idx] = candidateKey(c.payload);
    setPending(snapshot);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setPending({}); // 전체 호출 실패 → 큐 전체 비움.
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  // 확정 — 상태 전이(thumbnails_selected)라 새로고침하면 selected 요약으로 다시 그려진다(slot 폴링 불필요). 전체 잠금(confirmBusy).
  function onConfirm() {
    if (!window.confirm("이 3개 썸네일을 A/B/C 테스트 세트로 확정합니다.")) return;
    setError(null);
    setConfirmBusy(true);
    startTransition(async () => {
      try {
        await confirmThumbnails(runId);
        router.refresh();
      } catch (e) {
        setConfirmBusy(false);
        setError(e instanceof Error ? e.message : "확정 실패");
      }
    });
  }

  // 전체 액션(전체 재생성 2개·확정·전체 사유) 잠금 — 슬롯 큐가 도는 동안엔 전체 작업을 막는다(정합성). 슬롯 입력은 별도 결.
  const disabledGlobal = confirmBusy || hasPending;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {candidates.map((c) => {
          const slotBusy = c.idx in pending; // 이 슬롯이 큐에서 대기 중인가(슬롯별).
          const slotDisabled = confirmBusy || slotBusy; // 슬롯 입력/버튼 잠금 — 이 카드만. 다른 카드는 계속 누를 수 있다.
          return (
            <div
              key={c.idx}
              className={`flex flex-col justify-between border-2 ${slotBusy ? "border-trus-yellow" : "border-trus-white/25"}`}
            >
              <div>
                {/* 카드 헤더 — A/B/C 채운 뱃지 + 슬롯 진행 표시. 아래 본문과 구분선으로 분리해 위계를 또렷이. */}
                <div className="flex items-center justify-between border-b-2 border-trus-white/25 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center bg-trus-yellow text-sm font-black text-trus-black">
                    {String.fromCharCode(65 + c.idx)}
                  </span>
                  {slotBusy ? (
                    <span className="text-xs font-bold tracking-wide text-trus-yellow">생성 중…</span>
                  ) : (
                    <CandidateSourceBadge evidenceIds={c.evidence_ids} />
                  )}
                </div>
                <div className={`p-3 ${slotBusy ? "opacity-50" : ""}`}>
                  <CandidateBody stage="thumbnail" payload={c.payload} />
                </div>
              </div>
              <div className="m-3 mt-0 flex flex-col gap-2">
                {/* 카드별 사유(선택) — 이 칸만 다시 생성할 때 왜 다시인지. 비/공백이면 미전송(기존 동작). */}
                <label htmlFor={`${slotReasonBaseId}-${c.idx}`} className="sr-only">
                  {String.fromCharCode(65 + c.idx)} 칸 다시 생성 이유 (선택)
                </label>
                <input
                  id={`${slotReasonBaseId}-${c.idx}`}
                  type="text"
                  value={slotReasons[c.idx] ?? ""}
                  onChange={(e) => setSlotReasons((prev) => ({ ...prev, [c.idx]: e.target.value }))}
                  disabled={slotDisabled}
                  placeholder="이 칸 왜 다시? (선택)"
                  className="block w-full border border-trus-white/25 bg-transparent px-2 py-1.5 text-xs text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
                />
                <button
                  onClick={() => runSlotRegen(c.idx)}
                  disabled={slotDisabled}
                  className="border border-trus-white/30 px-3 py-2 text-xs font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
                >
                  {slotBusy ? "이 칸 생성 중…" : "이 썸네일만 다시 생성"}
                </button>

                {/* 교정 학습(독립) — '이 카피가 더 좋았다'는 이상 카피를 적어 교정쌍 저장→차이 분석.
                    재생성/확정과 무관(런 상태 안 바뀜). 재생성 잠금에 묶지 않는다(재생성 중에도 독립). */}
                <CorrectionPanel
                  idLabel={`${correctionBaseId}-${c.idx}`}
                  letter={String.fromCharCode(65 + c.idx)}
                  state={corrState(c.idx)}
                  onIdeal={(field, slot, value) => setIdealField(c.idx, field, slot, value)}
                  onSubmit={() => runCorrection(c)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 액션 — 보조(전체 다시 생성, outline)와 주 액션(확정, 노란 채움)을 좌우로 갈라 위계를 분명히. */}
      <div className="flex flex-col gap-3 border-t-2 border-trus-white/20 pt-4">
        {/* 전체 공용 사유(선택) — 3개 전체 다시 생성 시 함께 전달. 비/공백이면 미전송(기존 동작). */}
        <div className="max-w-md">
          <label htmlFor={allReasonId} className="mb-1.5 block text-xs font-bold text-trus-white/60">
            전체 다시 생성 이유 (선택)
          </label>
          <textarea
            id={allReasonId}
            value={allReason}
            onChange={(e) => setAllReason(e.target.value)}
            disabled={disabledGlobal}
            rows={2}
            placeholder="왜 다시? (선택) 예: 박스 문구 더 짧게"
            className="block w-full resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 전체 재생성 두 경로 — '다시 생성($0)'(로컬 우선) vs 'LLM으로 새로 써줘'(forceLlm·비용). 슬롯('이 칸만')은 별도 경로라 미변경. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => runAllRegen(() => regenerateThumbnails(runId, allReason))}
              disabled={disabledGlobal}
              className="border border-trus-yellow/50 px-5 py-2.5 text-sm font-bold text-trus-yellow hover:border-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
            >
              {hasPending ? "전체 생성 중…" : "다시 생성 ($0)"}
            </button>
            <button
              onClick={() => runAllRegen(() => regenerateThumbnails(runId, allReason, true))}
              disabled={disabledGlobal}
              className="border border-trus-white/30 px-5 py-2.5 text-sm font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
            >
              LLM으로 새로 써줘
            </button>
          </div>
          <button
            onClick={onConfirm}
            disabled={disabledGlobal}
            className="bg-trus-yellow px-6 py-2.5 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-40"
          >
            {confirmBusy ? "확정 중…" : "이 3개로 확정"}
          </button>
        </div>
      </div>

      {hasPending && !timedOut && (
        <div>
          <LiveRefresh active fallbackMs={3000} />
        </div>
      )}
      {hasPending && timedOut && (
        <p className="text-xs text-trus-white/50">새 썸네일이 위에 반영됐는지 확인하세요.</p>
      )}
      {error && <p className="text-xs font-bold text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}

// 카드별 교정 학습 패널 — '이 카피가 더 좋았다'는 이상 메인/박스를 적어 교정쌍 저장→차이 분석.
//   gen(AI 생성)은 후보 payload에서 자동 추출하므로 여기선 이상 카피만 입력받는다.
//   이상 입력이 전부 빈칸이면 버튼 비활성. 결과 diff는 읽기전용 인라인 표시.
const corrInputCls =
  "block w-full border border-trus-white/25 bg-transparent px-2 py-1.5 text-xs text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40";

function CorrectionPanel({
  idLabel,
  letter,
  state,
  onIdeal,
  onSubmit,
}: {
  idLabel: string;
  letter: string;
  state: CorrectionCardState;
  onIdeal: (field: "idealMain" | "idealBoxes", slot: 0 | 1, value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = [...state.idealMain, ...state.idealBoxes].some((v) => v.trim().length > 0) && !state.busy;
  return (
    <div className="mt-1 border-t border-trus-white/15 pt-2">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-trus-white/40">교정 학습 (선택)</p>
      <p className="mb-1.5 text-[10px] text-trus-white/40">{letter}안보다 더 좋은 카피를 적으면 차이를 분석합니다.</p>
      <div className="flex flex-col gap-1.5">
        {([0, 1] as const).map((slot) => (
          <div key={`m-${slot}`}>
            <label htmlFor={`${idLabel}-main-${slot}`} className="sr-only">
              {letter}안 이상 메인문구 {slot + 1}
            </label>
            <input
              id={`${idLabel}-main-${slot}`}
              type="text"
              value={state.idealMain[slot] ?? ""}
              onChange={(e) => onIdeal("idealMain", slot, e.target.value)}
              disabled={state.busy}
              placeholder={`이상 메인문구 ${slot + 1}`}
              className={corrInputCls}
            />
          </div>
        ))}
        {([0, 1] as const).map((slot) => (
          <div key={`b-${slot}`}>
            <label htmlFor={`${idLabel}-box-${slot}`} className="sr-only">
              {letter}안 이상 박스문구 {slot + 1}
            </label>
            <input
              id={`${idLabel}-box-${slot}`}
              type="text"
              value={state.idealBoxes[slot] ?? ""}
              onChange={(e) => onIdeal("idealBoxes", slot, e.target.value)}
              disabled={state.busy}
              placeholder={`이상 박스문구 ${slot + 1}`}
              className={corrInputCls}
            />
          </div>
        ))}
      </div>
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-label={`${letter}안 교정쌍 저장하고 차이 분석`}
        className="mt-1.5 w-full border border-trus-white/30 px-3 py-2 text-xs font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-40"
      >
        {state.busy ? "교정 분석 중…" : "이 썸네일 교정"}
      </button>
      {state.error && <p className="mt-1.5 text-[10px] font-bold text-trus-yellow">⚠ {state.error}</p>}
      {state.correctionId && !state.error && (
        <p className="mt-1.5 text-[10px] font-bold text-trus-yellow">교정 저장됨 · 차이 분석 완료</p>
      )}
      {state.diff && <CorrectionDiffView diff={state.diff} />}
    </div>
  );
}

// 교정 diff 읽기전용 표시 — 텍스트 필드(summary·tone·hook_angle·length_density) + 배열 필드(있을 때만).
//   added/removed/actionable_rules 는 빈배열 가능 → length>0 일 때만 렌더(빈 섹션 노출 금지).
function CorrectionDiffView({ diff }: { diff: CorrectionDiff }) {
  const lines: { label: string; value: string }[] = [
    { label: "총평", value: diff.summary },
    { label: "어투", value: diff.tone },
    { label: "후킹", value: diff.hook_angle },
    { label: "길이·압축", value: diff.length_density },
  ];
  const groups: { label: string; items: string[] }[] = [
    { label: "더 넣은 요소", items: diff.added },
    { label: "뺀 요소", items: diff.removed },
    { label: "적용 규칙", items: diff.actionable_rules },
  ];
  return (
    <div className="mt-2 flex flex-col gap-1.5 border border-trus-white/15 p-2">
      {lines.map((l) =>
        l.value.trim() ? (
          <div key={l.label} className="text-[10px]">
            <span className="text-trus-white/50">{l.label}: </span>
            <span className="text-trus-white/80">{l.value}</span>
          </div>
        ) : null,
      )}
      {groups.map((g) =>
        g.items.length > 0 ? (
          <div key={g.label} className="text-[10px]">
            <span className="text-trus-white/50">{g.label}: </span>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {g.items.map((it, i) => (
                <li key={i} className="text-trus-white/80">
                  · {it}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}
