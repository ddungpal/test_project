import type { RunState } from "@/domain/enums";

// 리서치 단계 진행 표시기 — 리서치 섹션 안에서 '지금 어느 단계, 무엇이 남았는지' 보여준다.
//   리서치 라이프사이클 4단계: 범위 선정 → 검증 실행 → 정리 → 완료.
//   셜록이 끝까지 자동으로 돈다(사람 클릭 없음). 최종 검수는 대본 단계에서 한 번만.
//   '검증 실행' 안에서 셜록 셀이 팩트검증→교차정리→숫자·비유→반론을 도는데, 그 세부 진행(i/5)은
//   상단 StageStepper와 본문 progress_note가 따로 보여준다. 여기선 상위 4단계 위치만 또렷이.
//   순수 표시(상태는 prop). TRUS 3색.

const PHASES = [
  { label: "범위 선정", crew: "셜록이 검증 범위 자동 선택" },
  { label: "검증 실행", crew: "팩트검증·교차정리·숫자/비유·반론" },
  { label: "정리", crew: "검수는 대본 단계에서 한 번" },
  { label: "완료", crew: "다음 단계(대본)로" },
] as const;

// 현재 상태 → 진행 위치(idx) + 작업중 여부 + 전체완료.
function phaseOf(state: RunState): { idx: number; working: boolean; allDone: boolean } {
  switch (state) {
    case "structure_selected":
      return { idx: 0, working: false, allDone: false }; // 리서치 시작 전
    case "research_scoped":
      return { idx: 0, working: true, allDone: false };
    case "researching":
      return { idx: 1, working: true, allDone: false };
    case "research_ready":
      return { idx: 2, working: true, allDone: false }; // 셜록이 정리 중(자동)
    case "research_review":
      return { idx: 2, working: true, allDone: false };
    default:
      return { idx: 3, working: false, allDone: true }; // research_approved 이후
  }
}

export function ResearchPhaseStepper({ state }: { state: RunState }) {
  const { idx, working, allDone } = phaseOf(state);

  return (
    <div className="mb-3 border border-trus-white/15 px-4 py-3">
      <ol className="flex items-center">
        {PHASES.map((p, i) => {
          const status = allDone || i < idx ? "done" : i === idx ? "current" : "upcoming";
          const circle =
            status === "done"
              ? "border-trus-yellow bg-trus-yellow text-trus-black"
              : status === "current"
                ? `border-trus-yellow text-trus-yellow ${working ? "animate-pulse" : ""}`
                : "border-trus-white/25 text-trus-white/35";
          const text = status === "done" ? "text-trus-white/70" : status === "current" ? "text-trus-yellow" : "text-trus-white/35";
          return (
            <li key={p.label} className="flex flex-1 flex-col items-center last:flex-none">
              <div className="flex w-full items-center">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-black ${circle}`}>
                  {status === "done" ? "✓" : i + 1}
                </div>
                {i < PHASES.length - 1 && (
                  <div className={`h-px flex-1 ${status === "done" ? "bg-trus-yellow/60" : "bg-trus-white/15"}`} />
                )}
              </div>
              <div className={`mt-1.5 w-full pr-2 text-[11px] font-bold leading-tight ${text}`}>
                {p.label}
                <span className="block text-[10px] font-normal opacity-60">{p.crew}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 border-t border-trus-white/10 pt-2 text-[11px] text-trus-white/55">
        {allDone ? (
          <>리서치 <span className="font-bold text-trus-yellow">완료</span> — 다음 단계로 진행할 수 있습니다.</>
        ) : (
          <>
            지금: <span className="font-bold text-trus-yellow">{PHASES[idx]!.label}</span>
            {working ? " — 셜록이 진행 중" : " 준비 중"} · 남은 단계 {PHASES.length - idx - 1}개
          </>
        )}
      </p>
    </div>
  );
}
