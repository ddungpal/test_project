"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateStage } from "@/app/actions/topicRun";
import { LiveRefresh } from "@/components/LiveRefresh";

// 안전 상한 — 완료는 proposalId 변경으로 감지하지만, 워커가 영영 끝나지 않을(실패) 때를 대비한 폴링 무한루프 방지.
//   ★ 고정 시간 cutoff을 '완료 판정'으로 쓰지 마라: opus 등 느린 모델은 단계 생성이 3분+ 걸려(실측 185s),
//     짧은 cutoff면 새 후보 도착 전에 폴링이 끊긴다. 그래서 상한은 넉넉히 두고 진짜 종료는 proposalId로 감지한다.
const POLL_LIMIT_MS = 300000; // 5분(안전망). 정상 종료는 proposalId 변경이 담당.

// '다시 생성'(§8.2) — 현재 후보를 버리고 force로 같은 단계를 다시 돌린다. regenerateStage(force) 호출.
//   보조 행동(확정보다 약한 위계) + 실수 클릭 방지 confirm. proposedState 분기에서만 노출(다운스트림 무효화 방지).
//   ★ 완료 감지: 재생성은 상태 전이 없이 새 stage_proposals 행만 INSERT(같은 proposedState 유지)라 state 신호가 없다.
//     대신 새 proposal의 id가 화면(props)에 도착하면 = 재생성 완료. 그때 폴링을 끈다(생성 시간 무관·robust).
export function RegenerateButton({ runId, stage, proposalId }: { runId: string; stage: "topic" | "titles" | "structure"; proposalId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [startId, setStartId] = useState<string | null>(null); // 제출 시점 proposalId(null=유휴). 이게 바뀌면 완료.
  const [timedOut, setTimedOut] = useState(false);
  const [reason, setReason] = useState(""); // 선택 입력 — 왜 다시 생성하는지. 비/공백이면 백엔드에서 미전송 처리.
  const reasonId = useId();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const submitted = startId !== null;

  // 완료 감지 — router.refresh 폴링으로 새 proposal이 도착하면 proposalId prop이 startId와 달라진다 → 폴링 종료.
  useEffect(() => {
    if (startId !== null && proposalId !== startId) {
      setStartId(null);
      setTimedOut(false);
      setReason(""); // 재생성 완료 → 다음 입력을 위해 이유칸 비움
    }
  }, [proposalId, startId]);

  // 안전 상한 — 워커 실패 등으로 영영 새 후보가 안 오면 폴링을 멈추고 안내만(무한 폴링 방지).
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => setTimedOut(true), POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [submitted]);

  // forceLlm=false: 로컬($0) 우선(hybrid) — 활성 스켈레톤 있으면 LLM 미호출·거의 즉시. true: LLM 새 창작.
  //   로컬 경로는 즉시 끝나도 완료=proposalId 변경으로 감지하므로 안 깨진다(기존 패턴 그대로).
  function onClick(forceLlm: boolean) {
    const msg = forceLlm
      ? "현재 후보를 버리고 LLM으로 새로 생성합니다(비용 발생)."
      : "현재 후보를 버리고 다시 생성합니다($0·로컬 우선).";
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      try {
        await regenerateStage(runId, stage, reason, forceLlm); // 빈/공백 reason·false forceLlm은 Max 쪽에서 미전송 → 기존 동작과 동일
        setStartId(proposalId); // 현재 proposalId 기록 → 새 행 도착해 바뀌면 완료
        router.refresh();
      } catch (e) {
        setStartId(null);
        setError(e instanceof Error ? e.message : "재생성 실패");
      }
    });
  }

  return (
    <div>
      <label htmlFor={reasonId} className="mb-1.5 block text-xs font-bold text-trus-white/60">
        다시 생성 이유 (선택)
      </label>
      <textarea
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending || submitted}
        rows={2}
        placeholder="왜 다시 생성하나요? (선택) 예: 더 자극적인 후킹으로"
        className="mb-2 block w-full max-w-md resize-none border border-trus-yellow/40 bg-transparent px-3 py-2 text-sm text-trus-white placeholder:text-trus-white/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
      />
      {/* 두 경로 — '다시 생성($0)'(로컬 우선·이유 없이 즉시) vs 'LLM으로 새로 써줘'(forceLlm·비용). 완료감지 로직 공유. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onClick(false)}
          disabled={pending || submitted}
          className="border border-trus-yellow/50 px-5 py-2 text-sm font-bold text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
        >
          {pending ? "요청 중…" : submitted ? "생성 중…" : "다시 생성 ($0)"}
        </button>
        <button
          onClick={() => onClick(true)}
          disabled={pending || submitted}
          className="border border-trus-white/30 px-5 py-2 text-sm font-bold text-trus-white/80 hover:border-trus-yellow hover:text-trus-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-trus-yellow disabled:opacity-50"
        >
          LLM으로 새로 써줘
        </button>
      </div>
      {submitted && !timedOut && (
        <div className="mt-2">
          <LiveRefresh active fallbackMs={3000} />
        </div>
      )}
      {submitted && timedOut && (
        <p className="mt-2 text-xs text-trus-white/50">새 후보가 위에 반영됐는지 확인하세요.</p>
      )}
      {error && <p className="mt-2 text-xs text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
