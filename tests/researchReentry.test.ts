// 리서치 단계 내부 되돌림(re-entry) — Step 0: 되돌림 전이 + 셀 fromStep='examples'.
//   (1) 전이표↔enums 일치(되돌림 4개 존재·DB 마이그레이션과 동기화 의도).
//   (2) 셀 fromStep='examples': 팩트검증(fact_verifier) 호출 0회·③리콘실 스킵·research_facts delete 미호출·
//       explanation_assets만 재생성. fake supa + 카운팅 driver로 검증(DB·실LLM 없음, 기존 테스트 패턴).
//   (3) fromStep 미지정/'full'은 기존 동작(회귀): 명세상 'full'이 현행 그대로임을 진입가드로 확인.
import { describe, it, expect } from "vitest";
import { canTransition, ALLOWED_TRANSITIONS } from "../src/domain/enums.js";
import { runResearchCell, type ResearchCellDeps } from "../src/pipeline/researchCell.js";
import { reenterResearch } from "../src/pipeline/researchReentry.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";

// ── (1) 되돌림 전이 ──────────────────────────────────────────────────────
describe("리서치 되돌림 전이(re-entry, migration 28 ↔ enums)", () => {
  it("research_ready/research_review에서 research_scoped로 되돌아갈 수 있다(scope 재선택)", () => {
    expect(canTransition("research_ready", "research_scoped")).toBe(true);
    expect(canTransition("research_review", "research_scoped")).toBe(true);
  });
  it("research_ready/research_review에서 researching으로 재진입할 수 있다(예시 재생성·재검증)", () => {
    expect(canTransition("research_ready", "researching")).toBe(true);
    expect(canTransition("research_review", "researching")).toBe(true);
  });
  it("되돌림 4개가 전이표에 존재한다(additive — 기존 전이 보존)", () => {
    // 기존 단방향 전이가 사라지지 않았는지 함께 확인(대체 아님).
    expect(ALLOWED_TRANSITIONS.research_ready).toContain("research_review"); // 기존 보존
    expect(ALLOWED_TRANSITIONS.research_review).toContain("research_approved"); // 기존 보존
    expect(ALLOWED_TRANSITIONS.research_review).toContain("researching"); // 27 이전부터 존재 — 중복 추가 안 함
    // 신규 4개.
    expect(ALLOWED_TRANSITIONS.research_ready).toEqual(
      expect.arrayContaining(["research_scoped", "researching"]),
    );
    expect(ALLOWED_TRANSITIONS.research_review).toEqual(
      expect.arrayContaining(["research_scoped", "researching"]),
    );
  });
});

// ── (2)(3) 셀 fromStep ───────────────────────────────────────────────────

// scope candidates — concept C(number)·concept D(analogy). claims는 examples에서 재검증 안 하므로 무관.
const candidates = [
  { idx: 0, payload: { kind: "claim", section: "S1", text: "주장A", is_financial: true } },
  { idx: 2, payload: { kind: "concept", section: "S1", name: "개념C", needs_number: true, needs_analogy: false } },
  { idx: 3, payload: { kind: "concept", section: "S3", name: "개념D", needs_number: false, needs_analogy: true } },
];

interface CellFakeOpts {
  runState: string;
  existingFacts: { claim: string; verification_status: string; quote_excerpt: string | null; escalated_to_human: boolean }[];
}

// 셀이 examples 경로에서 건드리는 테이블만 흉내: production_runs(get/transition), research_facts(select/delete),
//   explanation_assets(delete/insert), cost_ledger(insert), stage_proposals/stage_selections(loadSelectedScope).
function makeCellSupa(opts: CellFakeOpts) {
  const captured = {
    factsDeleted: false,
    assetsDeleted: false,
    insertedAssets: [] as Record<string, unknown>[],
    transition: undefined as { from: string; to: string } | undefined,
  };
  let runState = opts.runState;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          select() {
            return { eq() { return { single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }) }; } };
          },
          update(patch: { state?: string }) {
            return {
              eq() {
                return {
                  eq(_c: string, fromState: string) {
                    return {
                      select: async () => {
                        if (patch.state === undefined) return { data: [{ id: "run1" }], error: null }; // setProgress 등 비전이 update
                        if (fromState !== runState) return { data: [], error: null };
                        captured.transition = { from: fromState, to: patch.state };
                        runState = patch.state;
                        return { data: [{ id: "run1" }], error: null };
                      },
                    };
                  },
                  // setProgress: update().eq() 만(두번째 eq 없음).
                  then: undefined,
                };
              },
            };
          },
        };
      }
      if (table === "research_facts") {
        return {
          select() {
            return { eq: async () => ({ data: opts.existingFacts, error: null }) };
          },
          delete() {
            captured.factsDeleted = true; // ★ examples에선 절대 호출되면 안 됨.
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "explanation_assets") {
        return {
          delete() {
            captured.assetsDeleted = true;
            return { eq: async () => ({ error: null }) };
          },
          insert(rows: Record<string, unknown>[]) {
            captured.insertedAssets = rows;
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "cost_ledger") {
        return { insert: async () => ({ error: null }) };
      }
      if (table === "style_profiles") {
        // 유이 비유 스타일 주입 로드(active 없음 → null → system 바이트 동일). loadActiveAnalogyStyle 미러 체인.
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      }
      if (table === "stage_proposals") {
        const chain = {
          eq() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: { id: "prop1", candidates }, error: null }),
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        const chain = {
          eq() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => ({ data: { edited_payload: { selectedClaimIdx: [0], selectedConceptIdx: [2, 3] } }, error: null }),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

// roleId별 호출 횟수를 세는 driver. numbers/analogist는 유효 출력, fact_verifier는 (불려선 안 되지만) 더미.
function makeCountingDriver() {
  const calls: Record<string, number> = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p", // $0 — 비용 예약 없음(캡 무관).
    async invoke({ roleId }) {
      calls[roleId] = (calls[roleId] ?? 0) + 1;
      if (roleId === "numbers") {
        return { rawJson: JSON.stringify({ assets: [{ concept: "개념C", numeric_example: "100만원에 3만원", calculation: "1000000 * 0.03 = 30000", misleading_check: null }] }), usage };
      }
      if (roleId === "analogist") {
        return { rawJson: JSON.stringify({ assets: [{ concept: "개념D", analogy: "ETF는 도시락", distortion_note: "변동성은 못 담음" }] }), usage };
      }
      // fact_verifier/critic 등 — examples에선 불려선 안 됨. 불리면 명시적 출력으로 카운트만.
      return { rawJson: JSON.stringify({ assets: [] }), usage };
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

describe("runResearchCell fromStep='examples' — 예시만 재생성(②③⑦ 스킵·research_facts 보존)", () => {
  const existingFacts = [
    { claim: "주장A", verification_status: "verified", quote_excerpt: "근거 문장", escalated_to_human: false },
    { claim: "주장B", verification_status: "could_not_verify", quote_excerpt: null, escalated_to_human: true },
  ];

  function makeDeps(driver: LlmBackendDriver): ResearchCellDeps {
    return { supa: undefined as unknown as Supa, config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), ledger: new InMemoryCostLedger(), driver };
  }

  it("팩트검증(fact_verifier) 호출 0회 — ②검증·③리콘실 스킵", async () => {
    const { driver, calls } = makeCountingDriver();
    const { supa } = makeCellSupa({ runState: "researching", existingFacts });
    const deps = { ...makeDeps(driver), supa };
    await runResearchCell("run1", deps, { fromStep: "examples" });
    expect(calls["fact_verifier"] ?? 0).toBe(0); // 재검증 안 함.
    expect(calls["critic"] ?? 0).toBe(0); // 반론도 스킵.
    expect((calls["numbers"] ?? 0) + (calls["analogist"] ?? 0)).toBeGreaterThan(0); // 예시는 재실행.
  });

  it("research_facts delete 미호출(보존), explanation_assets만 재생성", async () => {
    const { driver } = makeCountingDriver();
    const { supa, captured } = makeCellSupa({ runState: "researching", existingFacts });
    const deps = { ...makeDeps(driver), supa };
    await runResearchCell("run1", deps, { fromStep: "examples" });
    expect(captured.factsDeleted).toBe(false); // ★ 절대 삭제 금지.
    expect(captured.assetsDeleted).toBe(true); // explanation_assets는 delete+insert.
    expect(captured.insertedAssets.length).toBeGreaterThan(0);
  });

  it("결과: factCount=기존 facts 수, escalatedCount=기존 facts에서 계산, critic은 빈 값, research_ready 복귀", async () => {
    const { driver } = makeCountingDriver();
    const { supa, captured } = makeCellSupa({ runState: "researching", existingFacts });
    const deps = { ...makeDeps(driver), supa };
    const res = await runResearchCell("run1", deps, { fromStep: "examples" });
    expect(res.state).toBe("research_ready");
    expect(res.factCount).toBe(2); // 기존 보존.
    expect(res.escalatedCount).toBe(1); // 주장B만 escalated.
    expect(res.critic).toEqual({ missing: [], counter_evidence: [] }); // 반론 미실행.
    expect(res.skipped).toBe(false);
    expect(captured.transition).toEqual({ from: "researching", to: "research_ready" });
  });

  it("researching이 아니면 진입 거부(재진입은 →researching 후 호출 전제)", async () => {
    const { driver } = makeCountingDriver();
    const { supa } = makeCellSupa({ runState: "research_review", existingFacts });
    const deps = { ...makeDeps(driver), supa };
    await expect(runResearchCell("run1", deps, { fromStep: "examples" })).rejects.toThrow(/researching/);
  });
});

describe("runResearchCell fromStep='full'(미지정 포함) — 현행 동작(회귀)", () => {
  it("진입 가드는 full에서도 동일: researching 아니면 거부", async () => {
    const { driver } = makeCountingDriver();
    const { supa } = makeCellSupa({ runState: "structure_selected", existingFacts: [] });
    const deps: ResearchCellDeps = { supa, config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), ledger: new InMemoryCostLedger(), driver };
    // fromStep 미지정 = 'full'. structure_selected에선 진입 거부(현행 그대로).
    await expect(runResearchCell("run1", deps)).rejects.toThrow(/researching/);
  });
});

// ── (4) reenterResearch 헬퍼(Step 2: 액션 가드+전이+fromStep 결정) ──────────
//   production_runs(getRun·transitionRun)만 흉내. transitionRun이 update().eq().eq(state).select() 형태인지,
//   patch에 rework 관련 키가 없는지를 captured로 검증(DB·LLM·Inngest 없음 — 헬퍼는 이벤트 발행 안 함).
interface ReentryFakeOpts {
  runState: string;
}
function makeReentrySupa(opts: ReentryFakeOpts) {
  const captured = {
    transition: undefined as { from: string; to: string } | undefined,
    transitionPatch: undefined as Record<string, unknown> | undefined,
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
            return {
              eq() {
                return {
                  eq(_c: string, fromState: string) {
                    return {
                      select: async () => {
                        if (fromState !== runState) return { data: [], error: null };
                        captured.transition = { from: fromState, to: patch.state as string };
                        captured.transitionPatch = patch;
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
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;
  return { supa, captured };
}

describe("reenterResearch — 리서치 내부 되돌림 헬퍼(가드+전이+fromStep)", () => {
  // research_ready·research_review 둘 다에서 동일하게 동작해야 한다.
  for (const from of ["research_ready", "research_review"] as const) {
    it(`${from}: scope → research_scoped 전이만(이벤트 없음)`, async () => {
      const { supa, captured } = makeReentrySupa({ runState: from });
      const res = await reenterResearch(supa, "run1", "scope");
      expect(res).toEqual({ event: false });
      expect(captured.transition).toEqual({ from, to: "research_scoped" });
    });

    it(`${from}: reverify → researching + fromStep='full'`, async () => {
      const { supa, captured } = makeReentrySupa({ runState: from });
      const res = await reenterResearch(supa, "run1", "reverify");
      expect(res).toEqual({ event: true, fromStep: "full" });
      expect(captured.transition).toEqual({ from, to: "researching" });
    });

    it(`${from}: examples → researching + fromStep='examples'`, async () => {
      const { supa, captured } = makeReentrySupa({ runState: from });
      const res = await reenterResearch(supa, "run1", "examples");
      expect(res).toEqual({ event: true, fromStep: "examples" });
      expect(captured.transition).toEqual({ from, to: "researching" });
    });
  }

  it("rework_count 미증가 — 전이 patch에 rework 관련 키가 없다", async () => {
    for (const kind of ["scope", "reverify", "examples"] as const) {
      const { supa, captured } = makeReentrySupa({ runState: "research_ready" });
      await reenterResearch(supa, "run1", kind);
      // patch는 state만(transitionRun 기본 빈 patch) — rework_count·rework 등 미포함.
      expect(captured.transitionPatch).toEqual({ state: kind === "scope" ? "research_scoped" : "researching" });
      expect(captured.transitionPatch).not.toHaveProperty("rework_count");
    }
  });

  // 잘못된 상태에서는 throw + 전이 없음(이벤트도 당연히 없음 — 헬퍼는 발행 안 하지만 transition도 안 일어남).
  for (const badState of ["structure_selected", "research_approved", "researching", "scripting"] as const) {
    for (const kind of ["scope", "reverify", "examples"] as const) {
      it(`${badState}에서 ${kind} 거부(throw·전이 없음)`, async () => {
        const { supa, captured } = makeReentrySupa({ runState: badState });
        await expect(reenterResearch(supa, "run1", kind)).rejects.toThrow(/리서치 결과\/검수 상태/);
        expect(captured.transition).toBeUndefined();
      });
    }
  }
});
