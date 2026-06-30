// 단일 최종 검수(autoflow §D) — reviewScript 헬퍼.
//   (1) reject 없음 → 보류 fact 전부 human_approved=true + script_review→approved.
//   (2) reject 있음 → 그 fact만 false·나머지 보류 true + script_review→scripting(rework).
//   (3) run 스코프 격리 — 모든 research_facts update가 .eq("run_id", runId)로 걸린다(타 run 미변경).
//   fake supa로 production_runs(get/transition)·research_facts(보류 select + update)만 흉내(DB·LLM 없음).
import { describe, it, expect } from "vitest";
import { reviewScript } from "../src/pipeline/scriptGate.js";
import type { Supa } from "../src/pipeline/runState.js";

interface FactRow {
  id: string;
  run_id: string;
  escalated_to_human: boolean;
  human_approved: boolean | null;
}

interface GateFakeOpts {
  runState: string;
  facts: FactRow[]; // 모든 run의 fact(스코프 격리 검증용 — 타 run fact도 섞어 넣음)
}

// production_runs(getRun·transitionRun)와 research_facts(보류 select + update) 흉내.
//   research_facts 보류 select: .select("id").eq("run_id",x).eq("escalated_to_human",true).is("human_approved",null)
//   research_facts update: .update(patch).eq("run_id",x).in("id",[...])
//   ★ update는 항상 run_id 필터가 선행됐는지를 captured로 검증(스코프 격리).
function makeGateSupa(opts: GateFakeOpts) {
  const facts = opts.facts.map((f) => ({ ...f })); // 복제(변경 추적)
  const captured = {
    transition: undefined as { from: string; to: string } | undefined,
    updates: [] as { runId: string; ids: string[]; humanApproved: boolean }[],
  };
  let runState = opts.runState;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          select() {
            return { eq() { return { single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0, rework_count: 0 }, error: null }) }; } };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq() {
                return {
                  eq(_c: string, fromState: string) {
                    return {
                      select: async () => {
                        if (fromState !== runState) return { data: [], error: null };
                        captured.transition = { from: fromState, to: patch.state as string };
                        runState = patch.state as string;
                        return { data: [{ id: "run1" }], error: null };
                      },
                    };
                  },
                  // bumpRework: update({rework_count}).eq("id") 만(두번째 eq 없음).
                  then: undefined,
                };
              },
            };
          },
        };
      }
      if (table === "research_facts") {
        return {
          // 보류 조회: select("id").eq("run_id",x).eq("escalated_to_human",true).is("human_approved",null)
          select() {
            let runIdFilter = "";
            const chain = {
              eq(col: string, val: string | boolean) {
                if (col === "run_id") runIdFilter = val as string;
                return chain;
              },
              is(_col: string, _v: null) {
                // 종단: 보류 = run 일치 && escalated && human_approved null
                const data = facts
                  .filter((f) => f.run_id === runIdFilter && f.escalated_to_human === true && f.human_approved === null)
                  .map((f) => ({ id: f.id }));
                return Promise.resolve({ data, error: null });
              },
            };
            return chain;
          },
          // update(patch).eq("run_id",x).in("id",[...])
          update(patch: { human_approved: boolean }) {
            let runIdFilter = "";
            return {
              eq(col: string, val: string) {
                if (col === "run_id") runIdFilter = val;
                return {
                  in(_col: string, ids: string[]) {
                    captured.updates.push({ runId: runIdFilter, ids, humanApproved: patch.human_approved });
                    // 실제 행 변경 — run_id 일치하는 것만(스코프).
                    for (const f of facts) {
                      if (f.run_id === runIdFilter && ids.includes(f.id)) f.human_approved = patch.human_approved;
                    }
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured, facts };
}

describe("reviewScript — 단일 최종 검수(보류 fact 확정 + 분기)", () => {
  it("(1) reject 없음 → 보류 fact 전부 human_approved=true + approved 전이", async () => {
    const { supa, captured, facts } = makeGateSupa({
      runState: "script_review",
      facts: [
        { id: "f1", run_id: "run1", escalated_to_human: true, human_approved: null }, // 보류
        { id: "f2", run_id: "run1", escalated_to_human: true, human_approved: null }, // 보류
        { id: "f3", run_id: "run1", escalated_to_human: false, human_approved: null }, // 자동통과(비보류)
      ],
    });
    const res = await reviewScript(supa, "run1", []);
    expect(res.state).toBe("approved");
    expect(captured.transition).toEqual({ from: "script_review", to: "approved" });
    // 보류 둘 다 true, 자동통과는 손 안 댐.
    expect(facts.find((f) => f.id === "f1")!.human_approved).toBe(true);
    expect(facts.find((f) => f.id === "f2")!.human_approved).toBe(true);
    expect(facts.find((f) => f.id === "f3")!.human_approved).toBe(null);
  });

  it("(2) reject 있음 → 그 fact만 false·나머지 보류 true + scripting(rework) 전이", async () => {
    const { supa, captured, facts } = makeGateSupa({
      runState: "script_review",
      facts: [
        { id: "f1", run_id: "run1", escalated_to_human: true, human_approved: null }, // 보류 → reject
        { id: "f2", run_id: "run1", escalated_to_human: true, human_approved: null }, // 보류 → 승인
      ],
    });
    const res = await reviewScript(supa, "run1", ["f1"]);
    expect(res.state).toBe("scripting");
    expect(captured.transition).toEqual({ from: "script_review", to: "scripting" });
    expect(facts.find((f) => f.id === "f1")!.human_approved).toBe(false);
    expect(facts.find((f) => f.id === "f2")!.human_approved).toBe(true);
  });

  it("(3) run 스코프 격리 — 모든 update가 run_id로 걸리고 타 run fact 미변경", async () => {
    const { supa, captured, facts } = makeGateSupa({
      runState: "script_review",
      facts: [
        { id: "f1", run_id: "run1", escalated_to_human: true, human_approved: null }, // run1 보류 → reject
        { id: "f2", run_id: "run1", escalated_to_human: true, human_approved: null }, // run1 보류 → 승인
        { id: "x1", run_id: "run2", escalated_to_human: true, human_approved: null }, // ★ 타 run — 절대 안 건드림
      ],
    });
    await reviewScript(supa, "run1", ["f1"]);
    // 모든 update가 run1 스코프.
    for (const u of captured.updates) expect(u.runId).toBe("run1");
    // 타 run fact는 null 그대로.
    expect(facts.find((f) => f.id === "x1")!.human_approved).toBe(null);
  });

  it("보류 목록 밖의 reject id는 무시(타 run·비보류 id 섞여도 스코프 안전)", async () => {
    const { supa, facts } = makeGateSupa({
      runState: "script_review",
      facts: [
        { id: "f1", run_id: "run1", escalated_to_human: true, human_approved: null }, // 보류
        { id: "x1", run_id: "run2", escalated_to_human: true, human_approved: null }, // 타 run
      ],
    });
    // x1(타 run)을 reject로 넣어도 → 보류 목록에 없으니 무시 → reject 없음 = approved 경로.
    const res = await reviewScript(supa, "run1", ["x1"]);
    expect(res.state).toBe("approved");
    expect(facts.find((f) => f.id === "f1")!.human_approved).toBe(true); // f1은 정상 승인.
    expect(facts.find((f) => f.id === "x1")!.human_approved).toBe(null); // 타 run 불변.
  });
});
