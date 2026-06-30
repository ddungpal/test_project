// 무중단 착지(research-gate-removal §B/§D) — enterScriptReview 헬퍼를 잠근다.
//   scriptStage가 script_write 성공(script_ready)일 때만 호출하는 전이로, 이게 "대본 검수 시작" 클릭을 대체한다.
//   (1) script_ready → script_review 전이(transition 캡처).
//   (2) 이미 script_review면 멱등 — no-op·throw 없음·transition 미발생.
//   (3) script_ready가 아닌 from-state(예: scripting)면 transitionRun 코드 가드(canTransition)에 막혀 throw.
//   fake supa로 production_runs(getRun=select.eq.single / transitionRun=update.eq.eq.select)만 흉내(DB·LLM 없음).
import { describe, it, expect } from "vitest";
import { enterScriptReview } from "../src/pipeline/scriptGate.js";
import type { Supa } from "../src/pipeline/runState.js";

function makeRunSupa(initialState: string) {
  const captured = { transition: undefined as { from: string; to: string } | undefined };
  let runState = initialState;

  const supa = {
    from(table: string) {
      if (table !== "production_runs") throw new Error(`unexpected table: ${table}`);
      return {
        // getRun: select("id, state, cost_usd").eq("id", x).single()
        select() {
          return { eq() { return { single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }) }; } };
        },
        // transitionRun: update({state}).eq("id", x).eq("state", from).select("id")
        update(patch: Record<string, unknown>) {
          return {
            eq() {
              return {
                eq(_c: string, fromState: string) {
                  return {
                    select: async () => {
                      if (fromState !== runState) return { data: [], error: null }; // 낙관적 잠금 불일치
                      captured.transition = { from: fromState, to: patch.state as string };
                      runState = patch.state as string;
                      return { data: [{ id: "run1" }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("enterScriptReview — 무중단 검수 착지", () => {
  it("(1) script_ready → script_review 전이", async () => {
    const { supa, captured } = makeRunSupa("script_ready");
    await enterScriptReview(supa, "run1");
    expect(captured.transition).toEqual({ from: "script_ready", to: "script_review" });
  });

  it("(2) 이미 script_review면 멱등 — no-op·transition 미발생", async () => {
    const { supa, captured } = makeRunSupa("script_review");
    await expect(enterScriptReview(supa, "run1")).resolves.toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("(3) script_ready가 아닌 from-state(scripting)는 코드 가드(canTransition)에 막혀 throw", async () => {
    const { supa, captured } = makeRunSupa("scripting");
    // enterScriptReview는 항상 script_ready→script_review를 시도 — 현재 상태가 scripting이면
    //   낙관적 잠금(from=script_ready ≠ scripting)에 걸려 "전이 무효" throw(잘못된 착지 차단).
    await expect(enterScriptReview(supa, "run1")).rejects.toThrow(/전이 무효/);
    expect(captured.transition).toBeUndefined();
  });
});
