// scope 선택 게이트(selectResearchScope) + 선택분 복원(loadSelectedScope) — 사람 게이트는 AI 0회.
//   가드(state·proposal 스코프·0개·없는 idx)와 기록 형태(chosen_idx=0 센티넬·edited_payload=선택 집합),
//   그리고 '선택된 candidate만' 교집합으로 복원(블라인드 slice 없음)을 가벼운 fake supa로 검증. DB·LLM 없음.
import { describe, it, expect } from "vitest";
import { selectResearchScope } from "../src/pipeline/researchScope.js";
import { loadSelectedScope } from "../src/pipeline/researchCell.js";
import type { Supa } from "../src/pipeline/runState.js";

// claims 0,1 / concepts 2,3 — 전역 idx(claims 먼저, 그 뒤 concepts). step1 저장 형태 미러.
const candidates = [
  { idx: 0, payload: { kind: "claim", section: "S1", default_selected: true, text: "주장A", is_financial: true } },
  { idx: 1, payload: { kind: "claim", section: "S2", default_selected: false, text: "주장B", is_financial: false } },
  { idx: 2, payload: { kind: "concept", section: "S1", default_selected: true, name: "개념C", needs_number: true, needs_analogy: false } },
  { idx: 3, payload: { kind: "concept", section: "S3", default_selected: false, name: "개념D", needs_number: false, needs_analogy: true } },
];

interface FakeOpts {
  runState: string;
  candidates: { idx: number; payload: unknown }[] | null; // null = proposal 없음
  // loadSelectedScope용: proposal에 매달린 최신 selection의 edited_payload(없으면 undefined)
  selectionPayload?: {
    selectedClaimIdx?: number[];
    selectedConceptIdx?: number[];
    manualClaims?: { text: string; is_financial: boolean; section?: string }[];
    manualConcepts?: { name: string; needs_number: boolean; needs_analogy: boolean; section?: string }[];
  };
}

// production_runs(getRun·transitionRun), stage_proposals(select chain), stage_selections(insert·select)만 흉내.
function makeSupa(opts: FakeOpts) {
  const captured: { insertedSelection?: Record<string, unknown>; transition?: { from: string; to: string } } = {};
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
                        if (fromState !== runState) return { data: [], error: null };
                        captured.transition = { from: fromState, to: patch.state! };
                        runState = patch.state!;
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
        const result =
          opts.candidates == null
            ? { data: null, error: null }
            : { data: { id: "prop1", candidates: opts.candidates }, error: null };
        const chain = {
          eq() { return chain; },
          order() { return chain; },
          limit() { return chain; },
          maybeSingle: async () => result,
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        return {
          insert(row: Record<string, unknown>) {
            captured.insertedSelection = row;
            return { select: () => ({ single: async () => ({ data: { id: "sel1" }, error: null }) }) };
          },
          // loadSelectedScope: select("edited_payload").eq.order.limit.maybeSingle()
          select() {
            const sresult = opts.selectionPayload === undefined
              ? { data: null, error: null }
              : { data: { edited_payload: opts.selectionPayload }, error: null };
            const chain = {
              eq() { return chain; },
              order() { return chain; },
              limit() { return chain; },
              maybeSingle: async () => sresult,
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("selectResearchScope — scope 선택 게이트(사람 게이트·AI 0회)", () => {
  it("정상: research_scoped에서 선택 → researching 전이·센티넬+선택집합 기록", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await selectResearchScope(supa, "run1", "prop1", { claims: [0], concepts: [2, 3] });

    expect(captured.insertedSelection?.chosen_idx).toBe(0); // 다중선택 센티넬
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.edited_payload).toEqual({ selectedClaimIdx: [0], selectedConceptIdx: [2, 3] });
    expect(captured.transition).toEqual({ from: "research_scoped", to: "researching" });
  });

  it("0개 선택이면 throw(조용히 통과 금지·전이 안 함)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await expect(selectResearchScope(supa, "run1", "prop1", { claims: [], concepts: [] })).rejects.toThrow(/최소 1개/);
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("state가 research_scoped가 아니면 throw", async () => {
    const { supa, captured } = makeSupa({ runState: "structure_selected", candidates });
    await expect(selectResearchScope(supa, "run1", "prop1", { claims: [0], concepts: [] })).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("proposal이 이 run·research에 없으면 throw", async () => {
    const { supa } = makeSupa({ runState: "research_scoped", candidates: null });
    await expect(selectResearchScope(supa, "run1", "prop1", { claims: [0], concepts: [] })).rejects.toThrow();
  });

  it("후보에 없는 idx가 섞이면 throw(교차 오염·오타 차단)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await expect(selectResearchScope(supa, "run1", "prop1", { claims: [0, 99], concepts: [] })).rejects.toThrow(/99/);
    expect(captured.insertedSelection).toBeUndefined();
  });
});

describe("selectResearchScope — 수동 추가(b·proposal 변형 없이 edited_payload 인라인)", () => {
  it("수동 claim/concept을 edited_payload에 인라인 저장(candidates 변형 없음)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await selectResearchScope(
      supa,
      "run1",
      "prop1",
      { claims: [0], concepts: [] },
      {
        claims: [{ text: "직접추가 주장", is_financial: true, section: "S9" }],
        concepts: [{ name: "직접추가 개념", needs_number: false, needs_analogy: true }],
      },
    );
    expect(captured.insertedSelection?.edited_payload).toEqual({
      selectedClaimIdx: [0],
      selectedConceptIdx: [],
      manualClaims: [{ text: "직접추가 주장", is_financial: true, section: "S9" }],
      manualConcepts: [{ name: "직접추가 개념", needs_number: false, needs_analogy: true }],
    });
    expect(captured.transition).toEqual({ from: "research_scoped", to: "researching" });
  });

  it("선택 idx 0개여도 수동 추가가 있으면 통과(합산 0개 가드)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await selectResearchScope(
      supa,
      "run1",
      "prop1",
      { claims: [], concepts: [] },
      { claims: [{ text: "수동만", is_financial: false }] },
    );
    expect(captured.insertedSelection).toBeDefined();
    expect(captured.transition).toEqual({ from: "research_scoped", to: "researching" });
  });

  it("선택·수동 모두 0개면 throw(합산 0개 가드)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await expect(
      selectResearchScope(supa, "run1", "prop1", { claims: [], concepts: [] }, { claims: [], concepts: [] }),
    ).rejects.toThrow(/최소 1개/);
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("수동 인자 미지정 시 edited_payload는 기존 형태와 byte-identical(키 추가 없음)", async () => {
    const { supa, captured } = makeSupa({ runState: "research_scoped", candidates });
    await selectResearchScope(supa, "run1", "prop1", { claims: [0], concepts: [2] });
    expect(captured.insertedSelection?.edited_payload).toEqual({ selectedClaimIdx: [0], selectedConceptIdx: [2] });
  });
});

describe("loadSelectedScope — 선택된 candidate만 복원(블라인드 slice 없음·교집합 정확)", () => {
  it("선택한 idx만 ScopeClaim/ScopeConcept로 복원하고 비선택은 제외", async () => {
    // 후보 4개 중 claim 0, concept 3만 선택 → claim 1·concept 2는 제외돼야 한다.
    const { supa } = makeSupa({
      runState: "researching",
      candidates,
      selectionPayload: { selectedClaimIdx: [0], selectedConceptIdx: [3] },
    });
    const res = await loadSelectedScope(supa, "run1");

    expect(res.claims).toEqual([{ text: "주장A", is_financial: true, section: "S1" }]);
    expect(res.concepts).toEqual([{ name: "개념D", needs_number: false, needs_analogy: true, section: "S3" }]);
    // 비선택(주장B·개념C)은 없어야 한다.
    expect(res.claims.find((c) => c.text === "주장B")).toBeUndefined();
    expect(res.concepts.find((c) => c.name === "개념C")).toBeUndefined();
  });

  it("전부 선택하면 전부 복원(슬라이스로 자르지 않음)", async () => {
    const { supa } = makeSupa({
      runState: "researching",
      candidates,
      selectionPayload: { selectedClaimIdx: [0, 1], selectedConceptIdx: [2, 3] },
    });
    const res = await loadSelectedScope(supa, "run1");
    expect(res.claims).toHaveLength(2);
    expect(res.concepts).toHaveLength(2);
  });

  it("선택 기록이 없으면 throw", async () => {
    const { supa } = makeSupa({ runState: "researching", candidates }); // selectionPayload 미지정 = 없음
    await expect(loadSelectedScope(supa, "run1")).rejects.toThrow();
  });

  it("수동 추가분을 candidate 선택분과 합쳐 반환(is_financial 보존·section 옵셔널)", async () => {
    const { supa } = makeSupa({
      runState: "researching",
      candidates,
      selectionPayload: {
        selectedClaimIdx: [0],
        selectedConceptIdx: [],
        manualClaims: [{ text: "수동주장", is_financial: false, section: "S9" }],
        manualConcepts: [{ name: "수동개념", needs_number: true, needs_analogy: false }],
      },
    });
    const res = await loadSelectedScope(supa, "run1");
    // candidate 0(주장A) + 수동 1개.
    expect(res.claims).toEqual([
      { text: "주장A", is_financial: true, section: "S1" },
      { text: "수동주장", is_financial: false, section: "S9" }, // ★ 저장된 is_financial 그대로(재판정 안 함).
    ]);
    // concept은 선택 0개 + 수동 1개. section 없으면 키 자체가 없어야 한다(옵셔널 보존).
    expect(res.concepts).toEqual([{ name: "수동개념", needs_number: true, needs_analogy: false }]);
  });

  it("수동 추가가 없으면 기존 동작 그대로(회귀 없음)", async () => {
    const { supa } = makeSupa({
      runState: "researching",
      candidates,
      selectionPayload: { selectedClaimIdx: [0], selectedConceptIdx: [2] },
    });
    const res = await loadSelectedScope(supa, "run1");
    expect(res.claims).toHaveLength(1);
    expect(res.concepts).toHaveLength(1);
  });
});
