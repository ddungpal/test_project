// 분기가(case_miner) — P4 case-branching step1.
//   (0) 역할 등록: case_miner roleId·opus·도구 없음.
//   (1) CASE_MINER_SCHEMA: 정상 출력·loose stray·빈 assets 통과 / 필수(grounded) 누락 거부(parseAndValidate 재사용).
//   (2) buildAssetRows: case asset → kind='case' row(normalizeCaseAsset 통과분만, branches<2면 드랍), caseAssets 미지정 시 number/analogy 불변.
//   (3) caseSectionsOf: format='case' 섹션만 추출·깨진 structure에 빈 배열.
//   (4) researchCell full 경로: case 섹션 ≥1일 때만 분기가 호출(case 0개면 0). ★ 거버넌스: 분기가 input에 댓글 원문(body) 없고 commentSignals만.
import { describe, it, expect } from "vitest";
import { ROLES, resolveModel, roleTools } from "../src/agents/roles.js";
import { CASE_MINER_SCHEMA } from "../src/agents/case_miner/schema.js";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { buildAssetRows } from "../src/pipeline/researchReconcile.js";
import { caseSectionsOf } from "../src/pipeline/comparisonAsset.js";
import { runResearchCell, type ResearchCellDeps } from "../src/pipeline/researchCell.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { LlmBackendDriver, LlmUsage } from "../src/llm/types.js";
import type { SearchBackend } from "../src/search/types.js";
import { CostGuard, InMemoryCostLedger } from "../src/llm/costGuard.js";
import type { LlmConfig } from "../src/llm/config.js";

// ── (0) 역할 등록 ──────────────────────────────────────────────────────────
describe("roles — case_miner 등록", () => {
  it("case_miner가 ROLES에 있고 roleId가 안정 키", () => {
    expect(ROLES.case_miner.roleId).toBe("case_miner");
  });
  it("resolveModel('case_miner') === 'opus'", () => {
    expect(resolveModel("case_miner")).toBe("opus");
  });
  it("case_miner는 도구 없음(§10 — web/fetch/code 없이 검증된 사실+댓글 집계 신호만)", () => {
    expect(roleTools("case_miner")).toEqual([]);
  });
});

// ── (1) 스키마 ───────────────────────────────────────────────────────────
describe("CASE_MINER_SCHEMA", () => {
  it("정상 출력(branches 2개·grounded 섞임)은 통과한다", () => {
    const json = JSON.stringify({
      assets: [
        {
          concept: "소득 상황별 저축 전략",
          intro: "상황에 따라 다르게",
          branches: [
            { condition: "월급이 일정하면", outcome: "자동이체로 선저축", grounded: true },
            { condition: "수입이 불규칙하면", outcome: "확인 필요", grounded: false },
          ],
        },
      ],
    });
    expect(() => parseAndValidate("분기가", CASE_MINER_SCHEMA, json)).not.toThrow();
  });

  it("loose stray(루트·asset·branch에 여분 필드)도 통과한다(claude-p 내성)", () => {
    const json = JSON.stringify({
      assets: [
        {
          concept: "케이스",
          branches: [
            { condition: "A", outcome: "x", grounded: true, note: "stray" },
            { condition: "B", outcome: "y", grounded: false },
          ],
          extra_field: "stray",
        },
      ],
      meta: "stray",
    });
    expect(() => parseAndValidate("분기가", CASE_MINER_SCHEMA, json)).not.toThrow();
  });

  it("빈 assets([])는 통과한다(만들 게 없으면 빈 배열 — 억지 금지)", () => {
    expect(() => parseAndValidate("분기가", CASE_MINER_SCHEMA, JSON.stringify({ assets: [] }))).not.toThrow();
  });

  it("필수 필드(grounded) 누락 branch는 거부한다", () => {
    const json = JSON.stringify({
      assets: [{ concept: "c", branches: [{ condition: "A", outcome: "x" }] }],
    });
    expect(() => parseAndValidate("분기가", CASE_MINER_SCHEMA, json)).toThrow(SchemaValidationError);
  });
});

// ── (2) buildAssetRows: case 합류 ──────────────────────────────────────────
describe("buildAssetRows — case 합류", () => {
  it("정상 case asset → kind='case' row, normalizeCaseAsset 통과·grounded 보존", () => {
    const rows = buildAssetRows("run1", [], [], [], [
      {
        concept: "소득 상황별 저축 전략",
        intro: "상황별로",
        branches: [
          { condition: "월급이 일정하면", outcome: "자동이체 선저축", grounded: true },
          { condition: "수입이 불규칙하면", outcome: "확인 필요", grounded: false },
        ],
      },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.kind).toBe("case");
    expect(row.concept).toBe("소득 상황별 저축 전략");
    expect(row.created_by).toBe("case_miner");
    expect(row.used_in_script).toBe(false);
    expect(row.payload).toEqual({
      intro: "상황별로",
      branches: [
        { condition: "월급이 일정하면", outcome: "자동이체 선저축", grounded: true },
        { condition: "수입이 불규칙하면", outcome: "확인 필요", grounded: false },
      ],
    });
  });

  it("normalizeCaseAsset이 null(branches 1개)이면 그 자산은 드랍(row 미생성)", () => {
    const rows = buildAssetRows("run1", [], [], [], [
      { concept: "단일", branches: [{ condition: "A", outcome: "x", grounded: true }] },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("통과분만 남고 드랍분은 빠진다(혼합)", () => {
    const rows = buildAssetRows("run1", [], [], [], [
      {
        concept: "ok",
        branches: [
          { condition: "A", outcome: "x", grounded: true },
          { condition: "B", outcome: "y", grounded: false },
        ],
      },
      { concept: "drop", branches: [{ condition: "A", outcome: "x", grounded: true }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.concept).toBe("ok");
  });

  it("caseAssets 미지정(4인자)이면 number/analogy 빌드 불변(기존 호출부 회귀)", () => {
    const rows = buildAssetRows(
      "run1",
      [{ concept: "복리", numeric_example: "100만원에 3만원", calculation: "1000000 * 0.03 = 30000", misleading_check: null }],
      [{ concept: "ETF", analogy: "도시락", distortion_note: "변동성은 못 담음" }],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind)).toEqual(["number", "analogy"]);
    expect(rows.some((r) => r.kind === "case")).toBe(false);
  });
});

// ── (3) caseSectionsOf ─────────────────────────────────────────────────────
describe("caseSectionsOf", () => {
  it("format='case' 섹션만 추출한다(다른 format·미지정 제외)", () => {
    const structure = {
      outline: [
        { section: "오프닝", goal: "공감", why: "쉬운 것 먼저" }, // format 없음 → 제외
        { section: "상품 비교", goal: "비교", why: "축이 분명", format: "table" }, // 제외
        { section: "상황별 사례", goal: "분기", why: "상황별", format: "case" }, // 추출
        { section: "또 다른 사례", goal: "케이스", why: "상황별", format: "case" }, // 추출
        { section: "마무리", goal: "정리", why: "행동", format: "explain" }, // 제외
      ],
    };
    expect(caseSectionsOf(structure)).toEqual([
      { section: "상황별 사례", goal: "분기" },
      { section: "또 다른 사례", goal: "케이스" },
    ]);
  });

  it("case 섹션이 없으면 빈 배열", () => {
    expect(caseSectionsOf({ outline: [{ section: "s", goal: "g", why: "w", format: "table" }] })).toEqual([]);
  });

  it("깨진 structure에 throw 없이 빈 배열", () => {
    const garbage: unknown[] = [undefined, null, 0, "x", [], {}, true, { outline: "nope" }, { outline: [1, "x", null, {}] }];
    for (const g of garbage) {
      expect(() => caseSectionsOf(g)).not.toThrow();
      expect(caseSectionsOf(g)).toEqual([]);
    }
  });

  it("goal 누락 섹션은 goal=''로(section만 string이면 추출)", () => {
    expect(caseSectionsOf({ outline: [{ section: "사례", format: "case" }] })).toEqual([{ section: "사례", goal: "" }]);
  });
});

// ── (4) researchCell full 경로 배선 — case 섹션 유무에 따른 분기가 호출 ──────
//   full 경로가 타는 테이블/검색을 fake로 흉내. roleId='case_miner' 호출 횟수로 배선 검증.
//   ★ 거버넌스: case 섹션 있을 때 comments_raw가 로드되고, 분기가 input엔 원문(body) 없이 commentSignals만 들어가는지 검증.

const scopeCandidates = [
  { idx: 0, payload: { kind: "claim", section: "S1", text: "청년도약계좌 금리는 연 6%", is_financial: true } },
];

interface FullFakeOpts {
  structurePayload: unknown; // getSelectedStagePayload('structure') 반환값.
}

// research candidates·structure/topic payload를 stage별로 분기해 흉내 + comments_raw fake.
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
                          : stage === "topic"
                            ? { data: { id: "topicProp", candidates: [{ idx: 0, payload: { title: "2030 재테크" } }] }, error: null }
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
                    proposalId === "structProp" || proposalId === "topicProp"
                      ? { data: { chosen_idx: 0, edited_payload: null }, error: null } // → candidates[0].payload
                      : { data: { edited_payload: { selectedClaimIdx: [0], selectedConceptIdx: [] } }, error: null },
                };
                return { eq: chain.eq, order: chain.order, limit: chain.limit, maybeSingle: chain.maybeSingle };
              },
            };
          },
        };
      }
      if (table === "comments_raw") {
        // governance: select().is().not().limit() 체인 → 본문 행 반환(분기가엔 원문 비전송, 코드 집계만).
        const chain = {
          select() { return chain; },
          is() { return chain; },
          not() { return chain; },
          limit: async () => ({ data: [{ body: "ISA 어떻게 가입하나요 청약도 궁금해요", like_count: 3 }], error: null }),
        };
        return chain;
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

// roleId별 호출 횟수·input 캡처 driver. fact_verifier 검증 더미, case_miner 빈 케이스, critic 더미.
function makeCountingDriver() {
  const calls: Record<string, number> = {};
  const inputs: Record<string, unknown[]> = {};
  const usage: LlmUsage = { inTok: 10, outTok: 10, cachedInTok: 0 };
  const driver: LlmBackendDriver = {
    name: "claude-p",
    async invoke({ roleId, input }) {
      calls[roleId] = (calls[roleId] ?? 0) + 1;
      (inputs[roleId] ??= []).push(input);
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
      if (roleId === "case_miner") return { rawJson: JSON.stringify({ assets: [] }), usage };
      if (roleId === "critic") return { rawJson: JSON.stringify({ missing: [], counter_evidence: [] }), usage };
      return { rawJson: JSON.stringify({ assets: [] }), usage };
    },
  };
  return { driver, calls, inputs };
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

describe("runResearchCell full 경로 — 분기가는 case 섹션 있을 때만 호출", () => {
  function makeDeps(driver: LlmBackendDriver, supa: Supa): ResearchCellDeps {
    return { supa, config: makeConfig(), costGuard: new CostGuard({ softCapUsd: 7, hardCapUsd: 10 }), ledger: new InMemoryCostLedger(), searchBackend: mockBackend, driver };
  }

  it("format='case' 섹션이 있으면 분기가(case_miner) 호출 1회 + input엔 원문 body 없이 commentSignals만(거버넌스)", async () => {
    const { driver, calls, inputs } = makeCountingDriver();
    const { supa } = makeFullSupa({
      structurePayload: { outline: [{ section: "상황별 사례", goal: "분기", why: "상황별", format: "case" }] },
    });
    await runResearchCell("run1", makeDeps(driver, supa));
    expect(calls["case_miner"] ?? 0).toBe(1);
    // 거버넌스: 분기가에 넘긴 input에 commentSignals만 있고 원문(body)은 어디에도 없다.
    const ci = inputs["case_miner"]![0] as { commentSignals?: unknown };
    expect(ci.commentSignals).toBeDefined();
    expect(JSON.stringify(ci)).not.toContain("body");
    expect(JSON.stringify(ci)).not.toContain("ISA 어떻게 가입하나요"); // 댓글 원문 텍스트 비전송 확인.
    const cs = ci.commentSignals as { question_comment_count: number; keyword_signals: unknown[] };
    expect(typeof cs.question_comment_count).toBe("number");
    expect(Array.isArray(cs.keyword_signals)).toBe(true);
  });

  it("case 섹션이 없으면 분기가 호출 0회(기존 런 동작·비용 불변)", async () => {
    const { driver, calls } = makeCountingDriver();
    const { supa } = makeFullSupa({
      structurePayload: { outline: [{ section: "오프닝", goal: "공감", why: "쉬운 것 먼저" }] },
    });
    await runResearchCell("run1", makeDeps(driver, supa));
    expect(calls["case_miner"] ?? 0).toBe(0);
  });
});
