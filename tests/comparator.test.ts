// 비교가(comparator) — P3 comparison-table step1.
//   (1) COMPARATOR_SCHEMA: 정상 출력·loose stray·빈 assets 통과(parseAndValidate 재사용).
//   (2) buildAssetRows: comparison asset → kind='comparison' row(payload normalize 통과분만, null이면 드랍, grounded→verified 매핑).
//   (3) tableSectionsOf: format='table' 섹션만 추출·깨진 structure에 빈 배열.
//   (4) researchCell full 경로: table 섹션 ≥1일 때만 비교가(comparator) 호출되는 배선(table 0개면 호출 0).
import { describe, it, expect } from "vitest";
import { ROLES, resolveModel, roleTools } from "../src/agents/roles.js";
import { COMPARATOR_SCHEMA } from "../src/agents/comparator/schema.js";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { buildAssetRows } from "../src/pipeline/researchReconcile.js";
import { tableSectionsOf } from "../src/pipeline/comparisonAsset.js";
import { runResearchCell, type ResearchCellDeps } from "../src/pipeline/researchCell.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";
import type { SearchBackend } from "../src/search/types.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";

// ── (0) 역할 등록 ──────────────────────────────────────────────────────────
describe("roles — comparator 등록", () => {
  it("comparator가 ROLES에 있고 roleId가 안정 키", () => {
    expect(ROLES.comparator.roleId).toBe("comparator");
  });
  it("resolveModel('comparator') === 'opus'", () => {
    expect(resolveModel("comparator")).toBe("opus");
  });
  it("comparator는 도구 없음(§10 — web/fetch 없이 검증된 사실만 구조화)", () => {
    expect(roleTools("comparator")).toEqual([]);
  });
});

// ── (1) 스키마 ───────────────────────────────────────────────────────────
describe("COMPARATOR_SCHEMA", () => {
  it("정상 비교 출력(entities 2·dimensions 1·grounded cells)은 통과한다", () => {
    const json = JSON.stringify({
      assets: [
        {
          concept: "청년 금융상품 비교",
          entities: ["청년도약계좌", "청년미래적금"],
          dimensions: ["금리"],
          cells: [
            { dimension: "금리", entity: "청년도약계좌", value: "연 6%", grounded: true },
            { dimension: "금리", entity: "청년미래적금", value: "확인 필요", grounded: false },
          ],
        },
      ],
    });
    expect(() => parseAndValidate("비교가", COMPARATOR_SCHEMA, json)).not.toThrow();
  });

  it("loose stray(루트·asset·cell에 여분 필드)도 통과한다(claude-p 내성)", () => {
    const json = JSON.stringify({
      assets: [
        {
          concept: "비교",
          entities: ["A", "B"],
          dimensions: ["금리"],
          cells: [{ dimension: "금리", entity: "A", value: "6%", grounded: true, note: "stray" }],
          extra_field: "stray",
        },
      ],
      meta: "stray",
    });
    expect(() => parseAndValidate("비교가", COMPARATOR_SCHEMA, json)).not.toThrow();
  });

  it("빈 assets([])는 통과한다(비교할 게 없으면 빈 배열 — 억지 금지)", () => {
    expect(() => parseAndValidate("비교가", COMPARATOR_SCHEMA, JSON.stringify({ assets: [] }))).not.toThrow();
  });

  it("필수 필드(grounded) 누락 cell은 거부한다", () => {
    const json = JSON.stringify({
      assets: [{ concept: "c", entities: ["A", "B"], dimensions: ["d"], cells: [{ dimension: "d", entity: "A", value: "x" }] }],
    });
    expect(() => parseAndValidate("비교가", COMPARATOR_SCHEMA, json)).toThrow(SchemaValidationError);
  });
});

// ── (2) buildAssetRows: comparison 합류 ────────────────────────────────────
describe("buildAssetRows — comparison 합류", () => {
  it("정상 comparison asset → kind='comparison' row, grounded→verified 매핑, normalize 통과", () => {
    const rows = buildAssetRows("run1", [], [], [
      {
        concept: "청년 금융상품 비교",
        entities: ["A", "B"],
        dimensions: ["금리"],
        cells: [
          { dimension: "금리", entity: "A", value: "연 6%", grounded: true },
          { dimension: "금리", entity: "B", value: "확인 필요", grounded: false },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.kind).toBe("comparison");
    expect(row.concept).toBe("청년 금융상품 비교");
    expect(row.created_by).toBe("comparator");
    expect(row.used_in_script).toBe(false);
    // grounded → verified 매핑 확인.
    expect(row.payload).toEqual({
      entities: ["A", "B"],
      dimensions: ["금리"],
      cells: [
        { dimension: "금리", entity: "A", value: "연 6%", verified: true },
        { dimension: "금리", entity: "B", value: "확인 필요", verified: false },
      ],
    });
  });

  it("normalizeComparison이 null(entities 1개)이면 그 자산은 드랍(row 미생성)", () => {
    const rows = buildAssetRows("run1", [], [], [
      { concept: "단일", entities: ["A"], dimensions: ["금리"], cells: [{ dimension: "금리", entity: "A", value: "6%", grounded: true }] },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("통과분만 남고 드랍분은 빠진다(혼합)", () => {
    const rows = buildAssetRows("run1", [], [], [
      { concept: "ok", entities: ["A", "B"], dimensions: ["금리"], cells: [{ dimension: "금리", entity: "A", value: "6%", grounded: true }] },
      { concept: "drop", entities: ["A"], dimensions: ["금리"], cells: [{ dimension: "금리", entity: "A", value: "6%", grounded: true }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("ok");
  });

  it("comparisonAssets 미지정(기본 [])이면 number/analogy 빌드 불변(기존 호출부 회귀)", () => {
    const rows = buildAssetRows(
      "run1",
      [{ concept: "복리", numeric_example: "100만원에 3만원", calculation: "1000000 * 0.03 = 30000", misleading_check: null }],
      [{ concept: "ETF", analogy: "도시락", distortion_note: "변동성은 못 담음" }],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind)).toEqual(["number", "analogy"]);
    expect(rows.some((r) => r.kind === "comparison")).toBe(false);
  });
});

// ── (3) tableSectionsOf ────────────────────────────────────────────────────
describe("tableSectionsOf", () => {
  it("format='table' 섹션만 추출한다(다른 format·미지정 제외)", () => {
    const structure = {
      outline: [
        { section: "오프닝", goal: "공감", why: "쉬운 것 먼저" }, // format 없음 → 제외
        { section: "상품 비교", goal: "나란히 비교", why: "축이 분명", format: "table" }, // 추출
        { section: "사례", goal: "분기", why: "상황별", format: "case" }, // 제외
        { section: "조건 비교", goal: "차이", why: "비교", format: "table" }, // 추출
        { section: "마무리", goal: "정리", why: "행동", format: "explain" }, // 제외
      ],
    };
    expect(tableSectionsOf(structure)).toEqual([
      { section: "상품 비교", goal: "나란히 비교" },
      { section: "조건 비교", goal: "차이" },
    ]);
  });

  it("table 섹션이 없으면 빈 배열", () => {
    expect(tableSectionsOf({ outline: [{ section: "s", goal: "g", why: "w", format: "explain" }] })).toEqual([]);
  });

  it("깨진 structure에 throw 없이 빈 배열", () => {
    const garbage: unknown[] = [undefined, null, 0, "x", [], {}, true, { outline: "nope" }, { outline: [1, "x", null, {}] }];
    for (const g of garbage) {
      expect(() => tableSectionsOf(g)).not.toThrow();
      expect(tableSectionsOf(g)).toEqual([]);
    }
  });

  it("goal 누락 섹션은 goal=''로(section만 string이면 추출)", () => {
    expect(tableSectionsOf({ outline: [{ section: "비교", format: "table" }] })).toEqual([{ section: "비교", goal: "" }]);
  });
});

// ── (4) researchCell full 경로 배선 — table 섹션 유무에 따른 비교가 호출 ───────
//   full 경로가 타는 테이블/검색을 fake로 흉내. roleId='comparator' 호출 횟수로 배선 검증.

const scopeCandidates = [
  { idx: 0, payload: { kind: "claim", section: "S1", text: "청년도약계좌 금리는 연 6%", is_financial: true } },
];

interface FullFakeOpts {
  structurePayload: unknown; // getSelectedStagePayload('structure') 반환값.
}

// research 단계 candidates·structure 단계 payload를 stage별로 분기해 흉내.
function makeFullSupa(opts: FullFakeOpts) {
  let runState = "researching";
  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          select(_c?: string, _o?: unknown) {
            return {
              eq() {
                return {
                  single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }),
                  // research_ready 멱등 head count는 안 탐(state=researching).
                };
              },
            };
          },
          update(patch: { state?: string }) {
            return {
              eq() {
                return {
                  eq(_c: string, fromState: string) {
                    return {
                      select: async () => {
                        if (patch.state === undefined) return { data: [{ id: "run1" }], error: null };
                        if (fromState !== runState) return { data: [], error: null };
                        runState = patch.state;
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
      if (table === "stage_proposals") {
        return {
          select() {
            return {
              eq(_c: string, _runId: string) {
                return {
                  eq(_c2: string, stage: string) {
                    const chain = {
                      eq() { return chain; },
                      order() { return chain; },
                      limit() { return chain; },
                      maybeSingle: async () =>
                        stage === "structure"
                          ? { data: { id: "structProp", candidates: [{ idx: 0, payload: opts.structurePayload }] }, error: null }
                          : { data: { id: "researchProp", candidates: scopeCandidates }, error: null },
                    };
                    return chain;
                  },
                };
              },
            };
          },
        };
      }
      if (table === "stage_selections") {
        return {
          select() {
            return {
              eq(_c: string, proposalId: string) {
                const chain = {
                  eq() { return chain; },
                  order() { return chain; },
                  limit() { return chain; },
                  maybeSingle: async () =>
                    proposalId === "structProp"
                      ? { data: { chosen_idx: 0, edited_payload: null }, error: null } // → candidates[0].payload = structurePayload
                      : { data: { edited_payload: { selectedClaimIdx: [0], selectedConceptIdx: [] } }, error: null },
                };
                return { eq: chain.eq, order: chain.order, limit: chain.limit, maybeSingle: chain.maybeSingle };
              },
            };
          },
        };
      }
      if (table === "research_facts") {
        return {
          delete() { return { eq: async () => ({ error: null }) }; },
          insert: async () => ({ error: null }),
        };
      }
      if (table === "explanation_assets") {
        return {
          delete() { return { eq: async () => ({ error: null }) }; },
          insert: async () => ({ error: null }),
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
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;
  return { supa };
}

// roleId별 호출 횟수 카운팅 driver. fact_verifier는 검증 출력, comparator는 빈 비교, critic 더미.
function makeCountingDriver() {
  const calls: Record<string, number> = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ roleId }) {
      calls[roleId] = (calls[roleId] ?? 0) + 1;
      if (roleId === "fact_verifier") {
        return {
          rawJson: JSON.stringify({
            verification_status: "could_not_verify", source_tier: "unknown", primary_source_url: null,
            quote_excerpt: null, citation_verified: false, independent_origin_count: 0,
            misleading_check: null, freshness: "unknown", reasoning: "더미",
          }),
          usage,
        };
      }
      if (roleId === "comparator") return { rawJson: JSON.stringify({ assets: [] }), usage };
      if (roleId === "critic") return { rawJson: JSON.stringify({ missing: [], counter_evidence: [] }), usage };
      return { rawJson: JSON.stringify({ assets: [] }), usage };
    },
  };
  return { driver, calls };
}

const mockBackend: SearchBackend = {
  name: "mock",
  async run() {
    return [{ title: "[MOCK] t", url: "https://x", content: "[MOCK] c", score: null, publisher: null, published_at: null }];
  },
};

function makeConfig(): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: "hybrid",
    softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: ["nts.go.kr"], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 },
    search: { defaultTtlSeconds: 86400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

describe("runResearchCell full 경로 — 비교가는 table 섹션 있을 때만 호출", () => {
  function makeDeps(driver: LlmBackendDriver, supa: Supa): ResearchCellDeps {
    return { supa, config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), ledger: new InMemoryCostLedger(), searchBackend: mockBackend, driver };
  }

  it("format='table' 섹션이 있으면 비교가(comparator) 호출 1회", async () => {
    const { driver, calls } = makeCountingDriver();
    const { supa } = makeFullSupa({
      structurePayload: { outline: [{ section: "상품 비교", goal: "비교", why: "축이 분명", format: "table" }] },
    });
    await runResearchCell("run1", makeDeps(driver, supa));
    expect(calls["comparator"] ?? 0).toBe(1);
  });

  it("table 섹션이 없으면 비교가 호출 0회(기존 런 동작·비용 불변)", async () => {
    const { driver, calls } = makeCountingDriver();
    const { supa } = makeFullSupa({
      structurePayload: { outline: [{ section: "오프닝", goal: "공감", why: "쉬운 것 먼저" }] },
    });
    await runResearchCell("run1", makeDeps(driver, supa));
    expect(calls["comparator"] ?? 0).toBe(0);
  });
});
