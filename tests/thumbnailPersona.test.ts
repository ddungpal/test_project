// 썸네일메이커(thumbnail_maker) prepare 배선(통합) 테스트 — target_persona 조건부 주입(downstream-context-injection step1).
//   훅이 hookPersonaWiring.test.ts 미러. thumbnail_maker prepare는 조회가 더 많다(ab_variants winning refs·style_profiles 등).
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 모든 조회를 빈/null로 돌려 B 케이스가 순수 THUMBNAIL_MAKER_SYSTEM이 되게 한다.
//   ★ ab_variants(winner)는 .select().eq().eq()로 끝나 await된다 — chain을 thenable로 안 만들면 {data,error} 미해결 → rows=[] → 조기 return [](promptHash 불변).
import { describe, it, expect } from "vitest";
import { prepareThumbnailMaker } from "../src/agents/thumbnail_maker/prepare.js";
import { THUMBNAIL_MAKER_SYSTEM, THUMBNAIL_PERSONA_DIRECTIVE } from "../src/agents/thumbnail_maker/schema.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — thumbnail_maker는 topic·title_thumb 둘 다 읽는다(getSelectedStagePayload 2회). 둘 다 title 필요.
const SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

interface FakeOptions {
  topicPersona?: string; // topic selection edited_payload의 target_persona(없으면 persona 미포함)
}

/** 테이블명으로 분기하는 체이너블 fake Supa. corpus_components/insights는 limit→then(배열), 나머지는 maybeSingle. */
function makeFakeSupa({ topicPersona }: FakeOptions = {}): Supa {
  const selection = topicPersona
    ? { ...SELECTION, edited_payload: { ...SELECTION.edited_payload, target_persona: topicPersona } }
    : SELECTION;

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
          return { data: { id: "prop", candidates: [] }, error: null };
        case "stage_selections":
          // topic·title_thumb 둘 다 이 selection을 받는다(fake는 stage 구분 없음). 둘 다 title 있어 selected_title도 채워짐.
          return { data: selection, error: null };
        case "tone_profile":
          return { data: null, error: null }; // 톤 없음(active·latest 둘 다 null)
        case "style_profiles":
          return { data: null, error: null }; // active 썸네일 스타일 없음 → THUMBNAIL_MAKER_SYSTEM 불변
        default:
          return { data: null, error: null };
      }
    };

    // corpus_components(thumbnail_copy) · insights(loadApprovedInsights)는 limit가 배열을 resolve.
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

describe("prepareThumbnailMaker 배선(통합) — target_persona 조건부 주입", () => {
  const PERSONA = "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람";

  it("케이스 A: topic payload에 target_persona가 있으면 system에 THUMBNAIL_PERSONA_DIRECTIVE 포함 + input.target_persona가 그 값", async () => {
    const supa = makeFakeSupa({ topicPersona: PERSONA });
    const { system, input } = await prepareThumbnailMaker(supa, "run-A");

    expect(system).toContain(THUMBNAIL_PERSONA_DIRECTIVE);
    expect(input.target_persona).toBe(PERSONA);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
    expect(input.selected_title).toBe("연봉 3천 이하 무조건 보세요"); // title_thumb 추출 불변
  });

  it("케이스 B(회귀 가드): persona가 없으면 input에 target_persona 키가 없고 system이 THUMBNAIL_MAKER_SYSTEM과 바이트 동일(promptHash 보존)", async () => {
    const supa = makeFakeSupa(); // topicPersona 미지정 + learned=[]·style=null·winning=[] → 순수 THUMBNAIL_MAKER_SYSTEM
    const { system, input } = await prepareThumbnailMaker(supa, "run-B");

    expect("target_persona" in input).toBe(false);
    expect(input.target_persona).toBeUndefined();
    expect(system).toBe(THUMBNAIL_MAKER_SYSTEM); // learned/style/winning 없으면 바이트 동일
  });

  it("케이스 C: THUMBNAIL_MAKER_SYSTEM 본문에 THUMBNAIL_PERSONA_DIRECTIVE가 포함돼 있지 않다(별도 상수) + 지시문은 'target_persona'를 포함한다", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).not.toContain(THUMBNAIL_PERSONA_DIRECTIVE);
    expect(THUMBNAIL_PERSONA_DIRECTIVE).toContain("target_persona");
  });
});
