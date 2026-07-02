// 셜록 리서치 scope input 컨텍스트 조립 테스트 — target_persona + 온보딩 금맥 조건부 소프트 주입(downstream-context-injection step2·방식 A).
//   ★ 방식 A: SHERLOCK_SCOPE_SYSTEM 무변경. scopeStep input에 키만 조건부로 얹는다(구다리 미러). 없으면 byte-identical → promptHash 보존.
//   전이/검증 로직(researchCell·fan-out·budget·buildScopeCandidates)은 절대 검증 대상이 아니다 — scope input 조립만 본다.
//   scopeStep을 vi.mock으로 스파이해 '실제 전달된 input'을 캡처한다. fake Supa는 조회+insert+transition을 흡수한다.
import { describe, it, expect, vi, beforeEach } from "vitest";

// scopeStep 스파이 — researchScope가 실제로 넘긴 input을 캡처. claims/concepts 최소 1개씩 돌려줘 buildScopeCandidates 통과.
const scopeCalls: unknown[] = [];
vi.mock("../src/agents/sherlock_lead/step.js", () => ({
  scopeStep: vi.fn(async (_llm: unknown, _runId: string, input: unknown) => {
    scopeCalls.push(input);
    return {
      claims: [{ text: "주장1", is_financial: true }],
      concepts: [{ name: "개념1", needs_number: true, needs_analogy: false }],
    };
  }),
}));

import { runResearchScope, regenerateResearchScope } from "../src/pipeline/researchScope.js";
import type { Supa } from "../src/pipeline/runState.js";

const PERSONA = "2030 사회초년생, 첫 월급으로 목돈 굴리는 법이 막막한 사람";
const GOLD = {
  confusionPoints: ["복리 계산이 헷갈림"],
  ahaPoints: ["파킹통장이 예금보다 유리할 수 있다"],
  coreAngle: "적은 돈부터 안전하게 굴리기",
  calibratedLevel: "입문",
};
const STRUCTURE = { outline: [{ section: "도입" }, { section: "본론" }] };

interface FakeOptions {
  persona?: string; // topic payload target_persona(없으면 미포함)
  gold?: typeof GOLD | null; // 온보딩 금맥(없으면 null)
  state?: string; // production_runs.state
}

// (run, stage) 선택 payload — stage별로 다른 payload를 돌려주려면 체인이 .eq("stage", x) 인자를 기억해야 한다.
//   getSelectedStagePayload: stage_proposals(maybeSingle) → stage_selections(maybeSingle).
//   loadOnboardingGold: stage_proposals(stage="onboarding" maybeSingle) → stage_selections(edited_payload maybeSingle).
function makeFakeSupa({ persona, gold, state = "structure_selected" }: FakeOptions = {}): Supa {
  const from = (table: string) => {
    const eqs: Record<string, unknown> = {};
    let proposalId: string | null = null; // stage_selections는 proposal_id로 분기(topic prop vs onboarding prop)

    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: unknown) => {
      eqs[col] = val;
      if (col === "proposal_id") proposalId = val as string;
      return chain;
    };
    chain.order = self;
    chain.limit = self;

    chain.single = async () => {
      if (table === "production_runs") {
        return { data: { id: "run-1", state, cost_usd: 0 }, error: null };
      }
      // stage_proposals insert().select().single() / transitionRun select 후 없음
      if (table === "stage_proposals") return { data: { id: "new-research-prop" }, error: null };
      return { data: null, error: null };
    };

    chain.maybeSingle = async () => {
      if (table === "stage_proposals") {
        const stage = eqs["stage"];
        // getSelectedStagePayload용 proposal id(stage로 구분) + loadOnboardingGold onboarding proposal.
        if (stage === "onboarding") return { data: gold ? { id: "prop-onboarding" } : null, error: null };
        return { data: { id: `prop-${stage}` }, error: null };
      }
      if (table === "stage_selections") {
        // onboarding proposal의 selection = 금맥.
        if (proposalId === "prop-onboarding") {
          return { data: gold ? { chosen_idx: 0, edited_payload: gold } : null, error: null };
        }
        // topic proposal의 selection = title(+persona). structure는 outline payload. 나머지(title_thumb)는 title만.
        if (proposalId === "prop-topic") {
          const payload: Record<string, unknown> = { title: "파킹통장 TOP5" };
          if (persona) payload.target_persona = persona;
          return { data: { chosen_idx: 0, edited_payload: payload }, error: null };
        }
        if (proposalId === "prop-structure") {
          return { data: { chosen_idx: 0, edited_payload: STRUCTURE }, error: null };
        }
        return { data: { chosen_idx: 0, edited_payload: { title: "제목" } }, error: null };
      }
      return { data: null, error: null };
    };

    // regenerate가 기존 research proposal candidates를 읽는 경로(stage="research" maybeSingle) — 위 maybeSingle이 처리하지만
    //   candidates가 필요하다. stage="research"일 때 candidates 빈 배열로.
    const origMaybe = chain.maybeSingle as () => Promise<unknown>;
    chain.maybeSingle = async () => {
      if (table === "stage_proposals" && eqs["stage"] === "research") {
        return { data: { candidates: [] }, error: null };
      }
      return origMaybe();
    };

    // insert/update는 체이너블로 흡수. transitionRun은 update().eq().eq().select("id")를 await하니 select가
    //   {data:[{id}]}로 resolve돼야 '전이 무효'가 안 난다 → select를 thenable로도 만든다(체이너블+thenable 겸용).
    chain.insert = (..._a: unknown[]) => chain;
    chain.update = (..._a: unknown[]) => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ id: "run-1" }], error: null });

    return chain;
  };
  return { from } as unknown as Supa;
}

// config는 suggestDefaultSelection에만 쓰인다(researchBudget). floor/ceiling/... shape만 맞으면 됨.
function makeDeps(supa: Supa) {
  return {
    supa,
    config: { research: { floor: 1, ceiling: 10, ratio: 1 } },
    costGuard: {},
  } as never;
}

describe("runResearchScope — persona·금맥 소프트 컨텍스트 조건부 주입(방식 A)", () => {
  beforeEach(() => {
    scopeCalls.length = 0;
  });

  it("케이스 A: persona·금맥이 있으면 scopeStep input에 target_persona + onboardingGold(4필드)가 실린다", async () => {
    const supa = makeFakeSupa({ persona: PERSONA, gold: GOLD });
    await runResearchScope("run-1", makeDeps(supa));

    expect(scopeCalls).toHaveLength(1);
    const input = scopeCalls[0] as Record<string, unknown>;
    expect(input.target_persona).toBe(PERSONA);
    expect(input.onboardingGold).toEqual({
      confusionPoints: GOLD.confusionPoints,
      ahaPoints: GOLD.ahaPoints,
      coreAngle: GOLD.coreAngle,
      calibratedLevel: GOLD.calibratedLevel,
    });
    // 기존 컨텍스트 조립 불변.
    expect(input.topic).toBe("파킹통장 TOP5");
    expect(input.title).toBe("제목"); // title_thumb은 topic이 아닌 기본 selection
    expect(input.outline).toEqual(STRUCTURE);
    expect(input.budget).toBeTruthy();
  });

  it("케이스 B(회귀 가드): persona·금맥이 둘 다 없으면 input에 두 키가 없고 기존 topic/title/outline/budget은 그대로다", async () => {
    const supa = makeFakeSupa({ gold: null });
    await runResearchScope("run-1", makeDeps(supa));

    expect(scopeCalls).toHaveLength(1);
    const input = scopeCalls[0] as Record<string, unknown>;
    expect("target_persona" in input).toBe(false);
    expect("onboardingGold" in input).toBe(false);
    // 기존 컨텍스트 조립 불변(persona/금맥 부재가 topic/title 추출을 흔들지 않는다).
    expect(input.topic).toBe("파킹통장 TOP5");
    expect(input.title).toBe("제목");
    expect(input.outline).toEqual(STRUCTURE);
    expect(input.budget).toBeTruthy();
  });
});

describe("regenerateResearchScope — 같은 조건부 주입(재생성 경로도 컨텍스트 빠지지 않음)", () => {
  beforeEach(() => {
    scopeCalls.length = 0;
  });

  it("케이스 A: persona·금맥이 있으면 재생성 input에도 target_persona + onboardingGold가 실리고, reason과 공존한다", async () => {
    const supa = makeFakeSupa({ persona: PERSONA, gold: GOLD, state: "research_scoped" });
    await regenerateResearchScope(supa, "run-1", makeDeps(supa), "더 필요해");

    expect(scopeCalls).toHaveLength(1);
    const input = scopeCalls[0] as Record<string, unknown>;
    expect(input.target_persona).toBe(PERSONA);
    expect(input.onboardingGold).toEqual({
      confusionPoints: GOLD.confusionPoints,
      ahaPoints: GOLD.ahaPoints,
      coreAngle: GOLD.coreAngle,
      calibratedLevel: GOLD.calibratedLevel,
    });
    expect(input.reason).toBe("더 필요해"); // 기존 reason 스프레드와 공존
  });

  it("케이스 B(회귀 가드): persona·금맥이 없으면 재생성 input에도 두 키가 없다", async () => {
    const supa = makeFakeSupa({ gold: null, state: "research_scoped" });
    await regenerateResearchScope(supa, "run-1", makeDeps(supa));

    expect(scopeCalls).toHaveLength(1);
    const input = scopeCalls[0] as Record<string, unknown>;
    expect("target_persona" in input).toBe(false);
    expect("onboardingGold" in input).toBe(false);
  });
});
