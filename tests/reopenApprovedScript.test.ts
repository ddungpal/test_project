// 승인된 런의 대본 재생성 재오픈(regenerate-approved-script §backend)을 잠근다.
//   (A) ALLOWED_TRANSITIONS에 approved→scripting 포함 — DB 전이표(마이그 20260705120035)와 동기화.
//   (B) reopenApprovedForScript: approved에서만 approved→scripting 전이, 비-approved는 throw.
//   fake supa로 production_runs(getRun=select.eq.single / transitionRun=update.eq.eq.select)만 흉내(DB·LLM 없음).
import { describe, it, expect } from "vitest";
import { ALLOWED_TRANSITIONS } from "../src/domain/enums.js";
import { reopenApprovedForScript } from "../src/pipeline/scriptGate.js";
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

describe("전이표 동기화 — approved→scripting", () => {
  it("(A) ALLOWED_TRANSITIONS.approved에 scripting 포함(기존 published·aborted 병존)", () => {
    expect(ALLOWED_TRANSITIONS.approved).toContain("scripting");
    expect(ALLOWED_TRANSITIONS.approved).toContain("published");
    expect(ALLOWED_TRANSITIONS.approved).toContain("aborted");
  });
});

describe("reopenApprovedForScript — 승인 런 대본 재생성 재오픈", () => {
  it("(B1) approved → scripting 전이 후 { state: 'scripting' }", async () => {
    const { supa, captured } = makeRunSupa("approved");
    const res = await reopenApprovedForScript(supa, "run1");
    expect(res).toEqual({ state: "scripting" });
    expect(captured.transition).toEqual({ from: "approved", to: "scripting" });
  });

  it("(B2) 비-approved 상태(script_review)면 throw·전이 미발생", async () => {
    const { supa, captured } = makeRunSupa("script_review");
    await expect(reopenApprovedForScript(supa, "run1")).rejects.toThrow(/approved/);
    expect(captured.transition).toBeUndefined();
  });

  it("(B3) 비-approved 상태(published)면 throw·전이 미발생", async () => {
    const { supa, captured } = makeRunSupa("published");
    await expect(reopenApprovedForScript(supa, "run1")).rejects.toThrow(/approved/);
    expect(captured.transition).toBeUndefined();
  });
});
