"use client";

// 쏙이 온보딩 퀴즈 — 아크 인터랙티브 재생(찍기 → 즉시 아하 공개 → 클리프행어로 다음 당김) → 응답 제출.
//   ★ 계약(props): { runId, arc }. 순수 재생/정오 로직은 컴포넌트 밖 src/lib/onboarding/playback.ts를 호출만 한다
//     (vitest @/ alias 없음 함정 — 컴포넌트에 로직·테스트 두지 않음). 저장은 submitOnboarding 액션 소관 — 호출만.
//   ★ 비주얼(Esther): TRUS Create 3색만(Black #121212 / Yellow #F8F082 / White). 그라데이션·그림자·이모지 남발 금지.
//     - 미검증 수치는 "확인 필요" 배지(ScriptReview 미러: border-trus-yellow 작은 라벨 + 좌측보더 border-l-2).
//     - hookMode(reversal=반전 / practical=실용템)는 색 남발 대신 노랑 보더 작은 라벨로만 구분.
//     - 정답/오답 피드백·진행 표시는 은은하게(과한 색·애니메이션 금지). 프리테스트 프레이밍 = '시험' 아닌 '호기심 체크'.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArcHookMode, ArcDifficulty } from "@/agents/onboarder/schema";
import type { OnboardingArc, OnboardingGold } from "@/agents/onboarder/schema";
import { LiveRefresh } from "@/components/LiveRefresh";
import {
  initPlayback,
  restorePlayback,
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
import type { ArcAnswer } from "@/lib/onboarding/arc";
import { buildRecap, recapScore } from "@/lib/onboarding/recap";
import { MustWatchReferences } from "@/components/MustWatchReferences";
import { submitOnboarding, requestOnboarding } from "@/app/actions/topicRun";

// 추가 문제 폴링 상한 — RequestOnboardingButton 미러.
const MORE_POLL_LIMIT_MS = 180000;

const DIFFICULTY_OPTIONS: readonly { d: ArcDifficulty; label: string }[] = [
  { d: "basic", label: "입문" },
  { d: "mid", label: "중급" },
  { d: "deep", label: "심화" },
];

// hookMode → 사람이 읽는 라벨. 색은 안 바꾸고(TRUS 3색) 라벨·보더 톤으로만 구분.
const HOOK_LABEL: Record<ArcHookMode, string> = {
  reversal: "반전",
  practical: "실용템",
};

// mode: live=구성 직전(금맥이 구다리로 넘어감) / review=구성 이후 복습(자동 반영 안 됨). 완료 문구만 분기, 재생·제출 로직은 동일.
// 새로고침해도 푼 이력이 남도록 응답·완료 여부를 localStorage에 저장(runId 스코프). 서버는 집계된 금맥만 저장 —
//   문항별 원응답은 어디에도 안 남으므로 클라 데이터 설계에 맞춰 브라우저에 보존한다. 파싱 실패·비활성 storage는 조용히 무시.
const answersKey = (runId: string) => `onboarding:answers:${runId}`;

function loadSaved(runId: string): { answers: ArcAnswer[]; done: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(answersKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { answers?: ArcAnswer[]; done?: boolean };
    return { answers: Array.isArray(parsed.answers) ? parsed.answers : [], done: !!parsed.done };
  } catch {
    return null;
  }
}

export function OnboardingQuiz({ runId, arc, gold, mode = "live" }: { runId: string; arc: OnboardingArc; gold?: OnboardingGold | null; mode?: "live" | "review" }) {
  const [state, setState] = useState<PlaybackState>(() => initPlayback(arc));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 새로고침 복원 — SSR 미스매치 방지를 위해 마운트 후 effect에서만 읽는다(초기 렌더는 서버와 동일한 기본값).
  //   restored가 true가 되기 전엔 저장 effect가 기본값으로 덮어쓰지 않도록 가드한다.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const saved = loadSaved(runId);
    if (saved && saved.answers.length > 0) {
      setState(restorePlayback(arc, saved.answers));
      setDone(saved.done);
    }
    setRestored(true);
    // arc은 의존성에서 제외 — 마운트 시 1회만 복원(확장 아크 이어붙이기는 아래 resume effect가 담당).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // 응답·완료 여부 저장 — 복원 완료 후에만(초기 빈 상태로 저장분을 덮어쓰지 않도록).
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(answersKey(runId), JSON.stringify({ answers: state.answers, done }));
    } catch {
      /* storage 비활성·용량초과 무시 */
    }
  }, [restored, runId, state.answers, done]);

  // 추가 문제(난이도 타겟) — 발행·폴링·타임아웃·에러. RequestOnboardingButton 미러.
  const [moreSubmitted, setMoreSubmitted] = useState(false);
  const [moreTimedOut, setMoreTimedOut] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [morePending, startMoreTransition] = useTransition();
  // 처음 문항 수 기억 — 확장 아크가 도착해 더 커지면 이어붙은 문항부터 재생한다.
  const prevLenRef = useRef(totalQuestions(state));

  // resume — 확장 아크(arc.questions가 커짐)가 도착하면 첫 새 문항부터 이어 풀기.
  //   기존 answers 보존 → 재제출 시 전체가 extractGold로 감(금맥 갱신). done 인스턴스는 유지되고 arc prop만 새로 흘러온다.
  useEffect(() => {
    const newLen = arc.questions?.length ?? 0;
    if (done && newLen > prevLenRef.current) {
      setState((s) => ({ ...s, arc, questionIdx: prevLenRef.current, revealed: false }));
      prevLenRef.current = newLen;
      setDone(false);
      setMoreSubmitted(false);
    }
  }, [arc, done]);

  // 추가 문제 발행 후 폴링 타임아웃 — RequestOnboardingButton 미러.
  useEffect(() => {
    if (!moreSubmitted) return;
    const t = setTimeout(() => setMoreTimedOut(true), MORE_POLL_LIMIT_MS);
    return () => clearTimeout(t);
  }, [moreSubmitted]);

  function requestMore(difficulty: ArcDifficulty) {
    setMoreError(null);
    startMoreTransition(async () => {
      try {
        await requestOnboarding(runId, { difficulty });
        setMoreSubmitted(true);
        router.refresh();
      } catch (e) {
        setMoreSubmitted(false);
        setMoreError(e instanceof Error ? e.message : "요청 실패");
      }
    });
  }

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
  //   gold가 있으면 실제 학습 내용(금맥 4필드)을 기존 카피 위에 표시. 없으면(미제출·구버전) 기존 카피만(하위호환).
  if (done) {
    // 복습(읽기 전용) — step0 헬퍼로 조인·집계. 조인/정오 로직은 컴포넌트에 다시 쓰지 않는다.
    const rows = buildRecap(state.arc, state.answers);
    const { correct, total } = recapScore(rows);
    return (
      <div className="flex flex-col gap-3">
        {gold && (
          <div className="flex flex-col gap-3 border-l-2 border-l-trus-yellow bg-trus-white/[0.03] px-3 py-2">
            {gold.confusionPoints.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">헷갈렸던 지점</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {gold.confusionPoints.map((p, i) => (
                    <li key={i} className="text-sm leading-relaxed text-trus-white/90">{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {gold.ahaPoints.length > 0 && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">아하 포인트</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {gold.ahaPoints.map((p, i) => (
                    <li key={i} className="text-sm leading-relaxed text-trus-white/90">{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {gold.coreAngle && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">핵심 갈림길</span>
                <p className="mt-1 text-sm font-bold leading-snug text-trus-white">{gold.coreAngle}</p>
              </div>
            )}
            {gold.calibratedLevel && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">추론된 수준</span>
                <p className="mt-1 text-sm leading-relaxed text-trus-white/90">{gold.calibratedLevel}</p>
              </div>
            )}
          </div>
        )}
        <div className="border border-trus-yellow px-4 py-3">
          <p className="text-sm font-black text-trus-yellow">{mode === "review" ? "복습 완료" : "이해 완료"}</p>
          <p className="mt-1 text-xs text-trus-white/60">
            {mode === "review"
              ? "이번 풀이는 이미 만든 구성엔 자동 반영되지 않아요 — 반영하려면 구성을 다시 생성하세요."
              : "여기서 나온 헷갈린 지점·아하·핵심 갈림길이 구성(구다리)으로 넘어갔어요."}
          </p>
        </div>

        {/* 내 풀이 복습(읽기 전용) — step0 buildRecap/recapScore 소비. total 0(방어)이면 생략.
            위계: 완료·금맥이 주. 복습은 보조라 요약·정답수를 summary 한 줄에 접어(기본 닫힘) 넣고,
            '시험 점수'가 아니라 '찍고 틀려도 좋아요' 헤더 톤에 맞춘 가벼운 복습 프레이밍으로 낮춘다. */}
        {total > 0 && (
          <details className="border-t border-trus-white/15 pt-3">
            <summary className="flex cursor-pointer items-baseline justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-trus-white/40 marker:text-trus-white/40">
              <span>내 풀이 다시 보기</span>
              <span className="shrink-0 tracking-widest">
                <span className="text-trus-yellow">{correct}</span>
                <span className="text-trus-white/40"> / {total} 맞힘</span>
              </span>
            </summary>
            <div className="mt-3 flex flex-col divide-y divide-trus-white/10">
                {rows.map((row, ri) => (
                  <div key={ri} className="flex flex-col gap-2 pt-4 first:pt-0">
                    {/* 질문 + difficulty 배지(HOOK_LABEL 배지 톤 미러) */}
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 border border-trus-white/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-trus-white/50">
                        {DIFFICULTY_OPTIONS.find((o) => o.d === row.question.difficulty)?.label ?? row.question.difficulty}
                      </span>
                      <p className="text-sm font-bold leading-snug text-trus-white">{row.question.prompt}</p>
                    </div>
                    {/* 보기 — 색만이 아니라 ✓/✗ 기호 + "정답"/"내 답·오답" 텍스트 + 오답픽 취소선으로 정오 병기(접근성). */}
                    <ul className="flex flex-col gap-1">
                      {row.question.choices.map((choice, ci) => {
                        const isAnswer = ci === row.question.answerIdx;
                        const isChosen = row.chosenIdx != null && ci === row.chosenIdx;
                        const isWrongPick = isChosen && !isAnswer;
                        const cls = isAnswer
                          ? "border-trus-yellow text-trus-yellow"
                          : isWrongPick
                            ? "border-trus-white/40 text-trus-white/70"
                            : "border-trus-white/15 text-trus-white/40";
                        return (
                          <li
                            key={ci}
                            className={`flex items-center justify-between gap-2 border px-3 py-1.5 text-sm ${cls}`}
                          >
                            <span>
                              <span aria-hidden="true" className="mr-1.5 font-bold">
                                {isAnswer ? "✓" : isWrongPick ? "✗" : ""}
                              </span>
                              {/* 오답으로 고른 보기는 취소선으로 색 없이도 '틀리게 골랐음'을 대비 */}
                              <span className={isWrongPick ? "line-through" : ""}>{choice}</span>
                            </span>
                            {isAnswer ? (
                              <span className="shrink-0 text-[10px] font-black uppercase tracking-widest">
                                {isChosen ? "정답 · 내 답" : "정답"}
                              </span>
                            ) : isWrongPick ? (
                              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-trus-white/50">
                                내 답 · 오답
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {/* 해설(ahaReveal) — 보기 아래 */}
                    <div className="border-l-2 border-l-trus-yellow bg-trus-white/[0.03] px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-trus-yellow">아하</span>
                      <p className="mt-1 text-sm leading-relaxed text-trus-white/90">{row.question.ahaReveal}</p>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}

        {/* 추가 문제 — 난이도 1개 선택 → 그 난이도 문항이 기존 아크에 이어붙어 재제출되면 금맥 갱신. live/review 둘 다 노출.
            위계: 완료·금맥이 주. 이 블록은 보조 액션이라 라벨을 흐린 톤(헤더의 '호기심 체크' 미러)으로 낮춘다. */}
        <div className="flex flex-col gap-2 border-t border-trus-white/15 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-trus-white/40">더 풀어보기</span>
            <span className="shrink-0 text-[10px] font-bold tracking-widest text-trus-white/40">선택</span>
          </div>
          <p className="text-xs text-trus-white/50">난이도를 골라 문제를 더 풀면 학습 내용이 갱신돼요.</p>
          <div className="flex gap-2" role="group" aria-label="추가 문제 난이도">
            {DIFFICULTY_OPTIONS.map(({ d, label }) => (
              <button
                key={d}
                type="button"
                onClick={() => requestMore(d)}
                disabled={morePending || moreSubmitted}
                className="flex-1 border border-trus-white/30 px-3 py-2 text-sm font-bold text-trus-white/85 hover:border-trus-yellow hover:text-trus-yellow disabled:cursor-default disabled:opacity-40 disabled:hover:border-trus-white/30 disabled:hover:text-trus-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trus-yellow"
              >
                {label}
              </button>
            ))}
          </div>
          {moreSubmitted && !moreTimedOut && (
            <div className="flex items-center gap-2">
              <LiveRefresh active fallbackMs={3000} />
              <p className="text-xs text-trus-white/60">쏙이가 문제 만드는 중… 잠시 후 새로고침</p>
            </div>
          )}
          {moreSubmitted && moreTimedOut && (
            <p className="text-xs text-trus-white/50">오래 걸립니다 — 새로고침하거나 로그를 확인하세요.</p>
          )}
          {moreError && <p className="text-xs font-bold text-trus-yellow">⚠ {moreError}</p>}
        </div>

        {/* 레퍼런스 영상 — 이 온보딩의 근거 영상 목록. 0개면 컴포넌트가 null 반환하므로 섹션 자동 생략(하위호환).
            문항별 출처가 아니라 온보딩 단위 목록이므로 스크립트 단계 "필수 시청"과 문구를 구분한다. */}
        {arc.references && arc.references.length > 0 && (
          <MustWatchReferences refs={arc.references} heading="이 온보딩의 근거 영상" />
        )}
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
