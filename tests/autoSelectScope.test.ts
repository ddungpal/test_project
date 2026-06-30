// auto-bridge(§A·§B) — autoSelectScope 정책 단위테스트 + autoPassResearchReview가 human_approved를 null로 보존하는지.
//   autoSelectScope: financial claim·needs_number/analogy concept만 선택, 평범 claim 제외, 빈/깨진 입력 방어.
//   autoPassResearchReview: research_facts.update를 절대 호출 안 함(human_approved null 보류) + 전이 from/to만.
//   fake supa는 selectResearchScope.test.ts 패턴 미러. DB·LLM 없음.
import { describe, it, expect } from "vitest";
import { autoSelectScope } from "../src/pipeline/researchScope.js";
import { autoPassResearchReview } from "../src/pipeline/researchGate.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { Candidate } from "../src/pipeline/stageContract.js";

// claims 0,1 / concepts 2,3,4 — 전역 idx(claims 먼저). buildScopeCandidates 저장 형태 미러.
const candidates: Candidate[] = [
  { idx: 0, payload: { kind: "claim", default_selected: true, text: "금융 주장", is_financial: true }, reason: "", evidence_ids: [] },
  { idx: 1, payload: { kind: "claim", default_selected: false, text: "평범 주장", is_financial: false }, reason: "", evidence_ids: [] },
  { idx: 2, payload: { kind: "concept", default_selected: true, name: "숫자 개념", needs_number: true, needs_analogy: false }, reason: "", evidence_ids: [] },
  { idx: 3, payload: { kind: "concept", default_selected: false, name: "비유 개념", needs_number: false, needs_analogy: true }, reason: "", evidence_ids: [] },
  { idx: 4, payload: { kind: "concept", default_selected: false, name: "평범 개념", needs_number: false, needs_analogy: false }, reason: "", evidence_ids: [] },
];

describe("autoSelectScope — 정책(나): financial claim·needs_number/analogy concept만", () => {
  it("금융 claim + 숫자/비유 concept만 선택, 평범한 건 제외", () => {
    const res = autoSelectScope(candidates);
    expect(res.claims).toEqual([0]); // 금융 주장만(평범 주장 1 제외)
    expect(res.concepts).toEqual([2, 3]); // 숫자·비유 개념(평범 개념 4 제외)
  });

  it("claims가 concepts보다 전역 idx 먼저(금융 우선 자연 정렬)", () => {
    const res = autoSelectScope(candidates);
    const all = [...res.claims, ...res.concepts];
    expect(all).toEqual([...all].sort((a, b) => a - b));
    if (res.claims.length && res.concepts.length) {
      expect(Math.max(...res.claims)).toBeLessThan(Math.min(...res.concepts));
    }
  });

  it("빈 후보 → 빈 선택", () => {
    expect(autoSelectScope([])).toEqual({ claims: [], concepts: [] });
  });

  it("고위험이 0건이면 빈 선택(검증할 게 없으면 출처만 — 사람 0-guard 없음)", () => {
    const plain: Candidate[] = [
      { idx: 0, payload: { kind: "claim", is_financial: false }, reason: "", evidence_ids: [] },
      { idx: 1, payload: { kind: "concept", needs_number: false, needs_analogy: false }, reason: "", evidence_ids: [] },
    ];
    expect(autoSelectScope(plain)).toEqual({ claims: [], concepts: [] });
  });

  it("깨진 입력 방어: null/undefined → 빈 선택(throw 금지)", () => {
    expect(autoSelectScope(null as unknown as Candidate[])).toEqual({ claims: [], concepts: [] });
    expect(autoSelectScope(undefined as unknown as Candidate[])).toEqual({ claims: [], concepts: [] });
  });

  it("깨진 입력 방어: payload 없음·idx 비숫자는 조용히 스킵", () => {
    const broken = [
      { idx: 0, payload: { kind: "claim", is_financial: true }, reason: "", evidence_ids: [] }, // 정상
      { idx: 1 }, // payload 없음 → 스킵
      { idx: "x", payload: { kind: "claim", is_financial: true } }, // idx 비숫자 → 스킵
      { payload: { kind: "concept", needs_number: true } }, // idx 없음 → 스킵
      null, // null 항목 → 스킵
      { idx: 5, payload: null }, // payload null → 스킵
    ] as unknown as Candidate[];
    const res = autoSelectScope(broken);
    expect(res).toEqual({ claims: [0], concepts: [] });
  });

  it("is_financial이 truthy지만 true가 아니면 제외(엄격 ===true)", () => {
    const fuzzy = [
      { idx: 0, payload: { kind: "claim", is_financial: 1 }, reason: "", evidence_ids: [] },
      { idx: 1, payload: { kind: "concept", needs_number: "yes" }, reason: "", evidence_ids: [] },
    ] as unknown as Candidate[];
    expect(autoSelectScope(fuzzy)).toEqual({ claims: [], concepts: [] });
  });
});

// ── autoPassResearchReview: 전이만·human_approved 미변경 ──────────────────────
interface PassOpts {
  runState: string;
}

function makeReviewSupa(opts: PassOpts) {
  const captured: { transitions: { from: string; to: string }[]; researchFactsUpdate: boolean } = {
    transitions: [],
    researchFactsUpdate: false,
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
                        if (fromState !== runState) return { data: [], error: null };
                        captured.transitions.push({ from: fromState, to: patch.state! });
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
      if (table === "research_facts") {
        // ★ research_facts.update가 불리면(=human_approved를 박으면) 플래그 ON. 자동전이는 절대 부르면 안 된다.
        return {
          update() {
            captured.researchFactsUpdate = true;
            return { eq() { return { in: async () => ({ data: [], error: null }) }; } };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("autoPassResearchReview — 전이만·human_approved null 보류(approveResearch 미사용)", () => {
  it("research_ready → review → approved 두 전이만, research_facts.update 미호출", async () => {
    const { supa, captured } = makeReviewSupa({ runState: "research_ready" });
    const res = await autoPassResearchReview(supa, "run1");

    expect(res.state).toBe("research_approved");
    expect(captured.transitions).toEqual([
      { from: "research_ready", to: "research_review" },
      { from: "research_review", to: "research_approved" },
    ]);
    // ★ 핵심 불변식: 에스컬레이션 fact의 human_approved를 건드리지 않는다(null 유지 = 보류).
    expect(captured.researchFactsUpdate).toBe(false);
  });

  it("이미 research_approved면 no-op(멱등·전이 0회)", async () => {
    const { supa, captured } = makeReviewSupa({ runState: "research_approved" });
    const res = await autoPassResearchReview(supa, "run1");
    expect(res.state).toBe("research_approved");
    expect(captured.transitions).toEqual([]);
    expect(captured.researchFactsUpdate).toBe(false);
  });

  it("research_review에서 재진입하면 approved 한 전이만(durable replay 안전)", async () => {
    const { supa, captured } = makeReviewSupa({ runState: "research_review" });
    const res = await autoPassResearchReview(supa, "run1");
    expect(res.state).toBe("research_approved");
    expect(captured.transitions).toEqual([{ from: "research_review", to: "research_approved" }]);
    expect(captured.researchFactsUpdate).toBe(false);
  });
});
