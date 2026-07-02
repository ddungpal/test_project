// 훅이(hook_maker) prepare 배선(통합) 테스트 — target_persona 조건부 주입(downstream-context-injection step0).
//   짠펜 SCRIBE_PERSONA_DIRECTIVE·구다리 structurerPrepareWiring(케이스 D/E/F) 미러.
//   ★ hook_maker는 system을 prepare.ts에서 합성하므로(learned/style append) structurer 미러가 정확하다.
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 종료 메서드(maybeSingle / limit→then)에서 테이블별 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareHookMaker } from "../src/agents/hook_maker/prepare.js";
import { HOOK_MAKER_SYSTEM, HOOK_PERSONA_DIRECTIVE } from "../src/agents/hook_maker/schema.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — hook_maker는 topic만 읽는다(getSelectedStagePayload 1회).
const TOPIC_SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

interface FakeOptions {
  topicPersona?: string; // topic selection edited_payload의 target_persona(없으면 persona 미포함)
}

/** 테이블명으로 분기하는 체이너블 fake Supa. corpus_components/insights는 limit→then(배열), 나머지는 maybeSingle. */
function makeFakeSupa({ topicPersona }: FakeOptions = {}): Supa {
  const topicSelection = topicPersona
    ? { ...TOPIC_SELECTION, edited_payload: { ...TOPIC_SELECTION.edited_payload, target_persona: topicPersona } }
    : TOPIC_SELECTION;

  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.in = self;
    chain.order = self;

    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          // getSelectedStagePayload는 id만 쓰고, edited_payload가 있으면 candidates는 안 읽음.
          return { data: { id: "prop-topic", candidates: [] }, error: null };
        case "stage_selections":
          return { data: topicSelection, error: null };
        case "tone_profile":
          return { data: null, error: null }; // 톤 없음(active·latest 둘 다 null)
        case "style_profiles":
          return { data: null, error: null }; // active 제목 스타일 없음 → HOOK_MAKER_SYSTEM 불변
        default:
          return { data: null, error: null };
      }
    };

    // corpus_components(select→eq→eq→limit) · insights(loadApprovedInsights, limit 종료)는 limit가 배열을 resolve.
    chain.limit = (..._args: unknown[]) => {
      if (table === "corpus_components" || table === "insights") {
        return { ...chain, then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }) };
      }
      return chain;
    };

    return chain;
  };
  return { from } as unknown as Supa;
}

describe("prepareHookMaker 배선(통합) — target_persona 조건부 주입", () => {
  const PERSONA = "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람";

  it("케이스 A: topic payload에 target_persona가 있으면 system에 HOOK_PERSONA_DIRECTIVE 포함 + input.target_persona가 그 값", async () => {
    const supa = makeFakeSupa({ topicPersona: PERSONA });
    const { system, input } = await prepareHookMaker(supa, "run-A");

    expect(system).toContain(HOOK_PERSONA_DIRECTIVE);
    expect(input.target_persona).toBe(PERSONA);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
  });

  it("케이스 B(회귀 가드): persona가 없으면 input에 target_persona 키가 없고 system이 HOOK_MAKER_SYSTEM과 바이트 동일(promptHash 보존)", async () => {
    const supa = makeFakeSupa(); // topicPersona 미지정 + learned=[] · style=null → 순수 HOOK_MAKER_SYSTEM
    const { system, input } = await prepareHookMaker(supa, "run-B");

    expect("target_persona" in input).toBe(false);
    expect(input.target_persona).toBeUndefined();
    expect(system).toBe(HOOK_MAKER_SYSTEM); // learned/style 없으면 바이트 동일
  });

  it("케이스 C: HOOK_MAKER_SYSTEM 본문에 HOOK_PERSONA_DIRECTIVE가 포함돼 있지 않다(별도 상수) + 지시문은 'target_persona'를 포함한다", () => {
    expect(HOOK_MAKER_SYSTEM).not.toContain(HOOK_PERSONA_DIRECTIVE);
    expect(HOOK_PERSONA_DIRECTIVE).toContain("target_persona");
  });
});
