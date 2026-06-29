// scope 재생성(regenerateResearchScope) — 셜록 후보 부족 시 '기존 외 추가'.
//   검증: research_scoped에서만 동작(다른 state throw)·새 stage_proposals(research) INSERT·★전이 없음(research_scoped 유지).
//   LLM은 카운팅 driver로 가짜(실 호출 0). fake supa로 다중 stage(context) + 기존 proposal 읽기 + insert를 흉내.
import { describe, it, expect } from "vitest";
import { regenerateResearchScope, type ResearchScopeDeps } from "../src/pipeline/researchScope.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";

// 기존 research proposal candidates(셜록이 이미 낸 것 — 중복 회피용으로 regenerate가 읽는다).
const existingResearchCandidates = [
  { idx: 0, payload: { kind: "claim", text: "기존주장A", is_financial: true } },
  { idx: 1, payload: { kind: "concept", name: "기존개념B", needs_number: true, needs_analogy: false } },
];

interface RegenFakeOpts {
  runState: string;
}

function makeRegenSupa(opts: RegenFakeOpts) {
  const captured = {
    insertedProposal: undefined as Record<string, unknown> | undefined,
    transition: undefined as { from: string; to: string } | undefined,
    runUpdates: [] as Record<string, unknown>[],
  };
  let runState = opts.runState;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          select() {
            return { eq() { return { single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }) }; } };
          },
          update(patch: Record<string, unknown>) {
            // regenerate의 cost 누계 갱신(비전이 update — 두번째 eq 없음). transition도 같은 경로지만 여기선 안 씀.
            captured.runUpdates.push(patch);
            return {
              eq() {
                return {
                  // 전이용(두번째 eq)도 대비 — regenerate는 호출 안 하므로 transition은 undefined로 남아야 정상.
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
                  then: undefined,
                };
              },
            };
          },
        };
      }
      if (table === "stage_proposals") {
        return {
          // getSelectedStagePayload(structure/topic/title_thumb) + 기존 research proposal 읽기 모두 이 체인을 탄다.
          select() {
            let stage = "";
            const chain = {
              eq(col: string, val: string) { if (col === "stage") stage = val; return chain; },
              order() { return chain; },
              limit() { return chain; },
              maybeSingle: async () => {
                if (stage === "research") return { data: { id: "rprop", candidates: existingResearchCandidates }, error: null };
                // context 단계들 — proposal 존재(선택 payload는 stage_selections가 제공).
                return { data: { id: `${stage}-prop`, candidates: [] }, error: null };
              },
            };
            return chain;
          },
          insert(row: Record<string, unknown>) {
            captured.insertedProposal = row;
            return { select: () => ({ single: async () => ({ data: { id: "newprop" }, error: null }) }) };
          },
        };
      }
      if (table === "stage_selections") {
        // getSelectedStagePayload용 — edited_payload에 title을 담아 컨텍스트 제공.
        return {
          select() {
            const chain = {
              eq() { return chain; },
              order() { return chain; },
              limit() { return chain; },
              maybeSingle: async () => ({ data: { chosen_idx: 0, edited_payload: { title: "샘플 제목" } }, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === "cost_ledger") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

function makeCountingDriver() {
  const calls: Record<string, number> = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ roleId }) {
      calls[roleId] = (calls[roleId] ?? 0) + 1;
      if (roleId === "sherlock_lead") {
        return {
          rawJson: JSON.stringify({
            claims: [{ text: "추가주장C", is_financial: false }],
            concepts: [{ name: "추가개념D", needs_number: false, needs_analogy: true }],
          }),
          usage,
        };
      }
      return { rawJson: JSON.stringify({ claims: [], concepts: [] }), usage };
    },
  };
  return { driver, calls };
}

function makeConfig(): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: "hybrid",
    softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: ["nts.go.kr"], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 },
    search: { defaultTtlSeconds: 86400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

function makeDeps(supa: Supa, driver: LlmBackendDriver): ResearchScopeDeps {
  // driver를 deps에 주입 → regenerate가 scopeStep(callLLM)에 그대로 전달 → 실 LLM 호출 0(카운팅 driver가 받음).
  return { supa, config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), ledger: new InMemoryCostLedger(), driver };
}

describe("regenerateResearchScope — scope 재생성(전이 없음·새 proposal)", () => {
  it("research_scoped에서 새 research proposal을 INSERT하고 전이하지 않는다", async () => {
    const { driver } = makeCountingDriver();
    const { supa, captured } = makeRegenSupa({ runState: "research_scoped" });
    const deps = { ...makeDeps(supa, driver), driver };
    const res = await regenerateResearchScope(supa, "run1", deps, "기존 후보가 너무 적어요");

    expect(res.proposalId).toBe("newprop");
    expect(captured.insertedProposal?.stage).toBe("research"); // 새 research proposal.
    expect(captured.insertedProposal?.run_id).toBe("run1");
    expect(captured.transition).toBeUndefined(); // ★ 전이 없음(research_scoped 유지).
  });

  it("research_scoped가 아니면 throw(다른 state 거부)", async () => {
    const { driver } = makeCountingDriver();
    const { supa, captured } = makeRegenSupa({ runState: "research_ready" });
    const deps = { ...makeDeps(supa, driver), driver };
    await expect(regenerateResearchScope(supa, "run1", deps, "이유")).rejects.toThrow(/research_scoped/);
    expect(captured.insertedProposal).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("structure_selected(scope 게이트 전)에서도 거부", async () => {
    const { driver } = makeCountingDriver();
    const { supa } = makeRegenSupa({ runState: "structure_selected" });
    const deps = { ...makeDeps(supa, driver), driver };
    await expect(regenerateResearchScope(supa, "run1", deps)).rejects.toThrow(/research_scoped/);
  });
});
