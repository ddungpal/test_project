"use client";

// 쏙이 온보딩 퀴즈 — 아크 인터랙티브 재생(찍기 → 즉시 아하 공개 → 클리프행어로 다음 당김) → 응답 제출.
//   ★ 계약(props): { runId, arc }. 순수 재생/정오 로직은 컴포넌트 밖 src/lib/onboarding/playback.ts를 호출만 한다
//     (vitest @/ alias 없음 함정 — 컴포넌트에 로직·테스트 두지 않음). 저장은 submitOnboarding 액션 소관 — 호출만.
//   ★ 비주얼(Esther): TRUS Create 3색만(Black #121212 / Yellow #F8F082 / White). 그라데이션·그림자·이모지 남발 금지.
//     - 미검증 수치는 "확인 필요" 배지(ScriptReview 미러: border-trus-yellow 작은 라벨 + 좌측보더 border-l-2).
//     - hookMode(reversal=반전 / practical=실용템)는 색 남발 대신 노랑 보더 작은 라벨로만 구분.
//     - 정답/오답 피드백·진행 표시는 은은하게(과한 색·애니메이션 금지). 프리테스트 프레이밍 = '시험' 아닌 '호기심 체크'.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArcHookMode } from "@/agents/onboarder/schema";
import type { OnboardingArc } from "@/agents/onboarder/schema";
import {
  initPlayback,
  currentQuestion,
  chooseAnswer,
  next,
  isRevealed,
  isCorrect,
  isComplete,
  collectAnswers,
  totalQuestions,
  type PlaybackState,
} from "@/lib/onboarding/playback";
import { submitOnboarding } from "@/app/actions/topicRun";

// hookMode → 사람이 읽는 라벨. 색은 안 바꾸고(TRUS 3색) 라벨·보더 톤으로만 구분.
const HOOK_LABEL: Record<ArcHookMode, string> = {
  reversal: "반전",
  practical: "실용템",
};

// mode: live=구성 직전(금맥이 구다리로 넘어감) / review=구성 이후 복습(자동 반영 안 됨). 완료 문구만 분기, 재생·제출 로직은 동일.
export function OnboardingQuiz({ runId, arc, mode = "live" }: { runId: string; arc: OnboardingArc; mode?: "live" | "review" }) {
  const [state, setState] = useState<PlaybackState>(() => initPlayback(arc));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const q = currentQuestion(state);
  const revealed = isRevealed(state);
  const complete = isComplete(state); // 마지막 문항까지 공개 완료 = 제출 가능

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await submitOnboarding(runId, collectAnswers(state));
        setDone(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "제출 실패");
      }
    });
  }

  // 제출 완료 — live면 금맥이 구다리로 넘어갔음. review는 이미 구성 생성 후라 자동 반영 안 됨(정직 카피).
  if (done) {
    return (
      <div className="border border-trus-yellow px-4 py-3">
        <p className="text-sm font-black text-trus-yellow">{mode === "review" ? "복습 완료" : "이해 완료"}</p>
        <p className="mt-1 text-xs text-trus-white/60">
          {mode === "review"
            ? "이번 풀이는 이미 만든 구성엔 자동 반영되지 않아요 — 반영하려면 구성을 다시 생성하세요."
            : "여기서 나온 헷갈린 지점·아하·핵심 갈림길이 구성(구다리)으로 넘어갔어요."}
        </p>
      </div>
    );
  }

  if (!q) {
    return <p className="text-sm text-trus-white/50">아크에 문항이 없습니다.</p>;
  }

  const total = totalQuestions(state);
  const stepNo = state.questionIdx + 1;

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 — 프리테스트 프레이밍('시험' 아닌 '호기심 체크') + 진행 표시(은은) */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">
          호기심 체크 · 찍고 틀려도 좋아요
        </span>
        <span className="shrink-0 text-[10px] font-bold tracking-widest text-trus-white/40">
          {stepNo} / {total}
        </span>
      </div>

      {/* 진행 도트 — 색 남발 없이 노랑/흐림 두 톤만 */}
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-0.5 flex-1 ${i <= state.questionIdx ? "bg-trus-yellow" : "bg-trus-white/15"}`}
          />
        ))}
      </div>

      {/* 문항 — hookMode 라벨 + prompt */}
      <div className="flex flex-col gap-2">
        <span className="w-fit border border-trus-yellow px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-trus-yellow">
          {HOOK_LABEL[q.hookMode]}
        </span>
        <p className="text-base font-bold leading-snug text-trus-white">{q.prompt}</p>
      </div>

      {/* 보기 — 찍기 전엔 중립, 찍은 뒤엔 정답=노랑, 내가 고른 오답=표식(은은) */}
      <div className="flex flex-col gap-2" role="group" aria-label="보기">
        {q.choices.map((choice, i) => {
          const chosen = state.answers.some(
            (a) => a.questionIdx === state.questionIdx && a.chosenIdx === i,
          );
          const correct = isCorrect(state, i);
          // 찍기 전: 중립 보더. 공개 후: 정답=노랑 강조 / 내가 고른 오답=흐린 보더 유지 + 표식 / 나머지=흐림.
          const cls = !revealed
            ? "border-trus-white/30 text-trus-white/85 hover:border-trus-yellow"
            : correct
              ? "border-trus-yellow text-trus-yellow"
              : chosen
                ? "border-trus-white/40 text-trus-white/70"
                : "border-trus-white/15 text-trus-white/40";
          return (
            <button
              key={i}
              type="button"
              onClick={() => setState(chooseAnswer(state, i))}
              disabled={revealed}
              aria-pressed={chosen}
              className={`flex items-center justify-between gap-2 border px-3 py-2 text-left text-sm disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow ${cls}`}
            >
              <span>{choice}</span>
              {revealed && correct && (
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest">정답</span>
              )}
              {revealed && !correct && chosen && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-trus-white/50">
                  내 선택
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 아하 공개 — 좌측 노랑 보더로 강조(ScriptReview 강조 톤 미러) */}
      {revealed && (
        <div className="flex flex-col gap-3 border-l-2 border-l-trus-yellow bg-trus-white/[0.03] px-3 py-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">아하</span>
            <p className="mt-1 text-sm leading-relaxed text-trus-white/90">{q.ahaReveal}</p>
          </div>

          {/* 미검증 수치 — ScriptReview '확인 필요' 배지 미러(진짜 검증은 셜록) */}
          {q.unverifiedNumbers && q.unverifiedNumbers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 border border-trus-yellow px-1 py-0.5 text-[10px] font-bold text-trus-yellow">
                확인 필요
              </span>
              <span className="text-[11px] text-trus-white/60">
                {q.unverifiedNumbers.join(" · ")}
              </span>
            </div>
          )}

          {/* 클리프행어 — 다음 문항을 당기는 한 줄(있을 때만) */}
          {!complete && q.cliffhanger && (
            <p className="text-xs font-bold text-trus-white/70">{q.cliffhanger}</p>
          )}
        </div>
      )}

      {/* 마지막 문항 공개 후 — coreAngle을 '핵심 갈림길'로 보여주고 제출 */}
      {revealed && complete && arc.coreAngle && (
        <div className="border border-trus-white/25 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">
            이 영상의 핵심 갈림길
          </span>
          <p className="mt-1 text-sm font-bold leading-snug text-trus-white">{arc.coreAngle}</p>
        </div>
      )}

      {/* 진행 / 제출 버튼 */}
      {revealed && (
        <div>
          {!complete ? (
            <button
              type="button"
              onClick={() => setState(next(state))}
              className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow"
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-trus-yellow px-5 py-2 text-sm font-black text-trus-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow disabled:opacity-50"
            >
              {pending ? "저장 중…" : "다 이해했어요 — 구성으로"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs font-bold text-trus-yellow">⚠ {error}</p>}
    </div>
  );
}
