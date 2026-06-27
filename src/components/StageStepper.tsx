import type { RunState } from "@/domain/enums";
import { PIPELINE_STEPS, getProgress, parseSubProgress } from "@/lib/dashboard/stageProgress";
import { LiveRefresh } from "./LiveRefresh";

// 파이프라인 5단계 진행 스테퍼 — 전체 단계 + 현재 위치 + AI 작업 중 여부 + 단계 내부 서브진행.
//   순수 서버 컴포넌트(상태는 props). 작업 중일 때만 LiveRefresh(Realtime+폴백) 동반.
export function StageStepper({ state, progressNote }: { state: RunState; progressNote?: string | null }) {
  const prog = getProgress(state, progressNote);
  const sub = prog.isWorking ? parseSubProgress(progressNote) : null;

  return (
    <div className="border border-trus-white/15 px-4 py-3">
      <ol className="flex items-center">
        {PIPELINE_STEPS.map((s, i) => {
          const st = prog.stepStatus(i);
          const working = i === prog.step && prog.isWorking;
          const circle =
            st === "done"
              ? "border-trus-yellow bg-trus-yellow text-trus-black"
              : st === "current"
                ? `border-trus-yellow text-trus-yellow ${working ? "animate-pulse" : ""}`
                : "border-trus-white/25 text-trus-white/35";
          const text =
            st === "done" ? "text-trus-white/70" : st === "current" ? "text-trus-yellow" : "text-trus-white/35";
          return (
            <li key={s.key} className="flex flex-1 flex-col items-center last:flex-none">
              <div className="flex w-full items-center">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-black ${circle}`}>
                  {st === "done" ? "✓" : i + 1}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${st === "done" ? "bg-trus-yellow/60" : "bg-trus-white/15"}`} />
                )}
              </div>
              <div className={`mt-1.5 w-full pr-2 text-[11px] font-bold leading-tight ${text}`}>
                {s.label}
                <span className="block text-[10px] font-normal opacity-60">{s.crew}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-trus-white/10 pt-2">
        <span className={`text-xs font-bold ${prog.terminal === "aborted" ? "text-trus-white/40" : "text-trus-yellow"}`}>
          {prog.isWorking ? "● " : prog.phase === "done" ? "✓ " : "▷ "}
          {prog.statusLabel}
        </span>
        {prog.isWorking && <LiveRefresh active={prog.isWorking} />}
      </div>

      {sub && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-trus-white/55">
            <span>
              현재 작업: <span className="font-bold text-trus-yellow">{sub.label}</span>
            </span>
            <span className="font-mono text-trus-white/40">{sub.index}/{sub.total}</span>
          </div>
          <div className="mt-1 flex gap-1">
            {Array.from({ length: sub.total }).map((_, i) => {
              const done = i + 1 < sub.index;
              const active = i + 1 === sub.index;
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 ${done ? "bg-trus-yellow/60" : active ? "animate-pulse bg-trus-yellow" : "bg-trus-white/15"}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
