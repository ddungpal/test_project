// 훅이(hook_maker) prepare 배선(통합) 테스트 — 주제 맥락(topic_reason·audience_need·audience_level) 조건부 주입(topic-context-to-copy step0).
//   hookPersonaWiring.test.ts의 fake Supa 패턴 미러. 주제 맥락 있으면 input/system에 주입, 없으면 바이트 불변(회귀 가드).
import { describe, it, expect } from "vitest";
import { prepareHookMaker } from "../src/agents/hook_maker/prepare.js";
import { HOOK_MAKER_SYSTEM, HOOK_TOPIC_CONTEXT_DIRECTIVE } from "../src/agents/hook_maker/schema.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — hook_maker는 topic만 읽는다(getSelectedStagePayload 1회).
const TOPIC_SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

interface FakeOptions {
  topicReason?: string; // topic selection edited_payload의 reason(없으면 미포함)
  audienceNeed?: string; // topic selection edited_payload의 audience_need(없으면 미포함)
  audienceLevel?: string; // topic selection edited_payload의 audience_level(없으면 미포함)
}

/** 테이블명으로 분기하는 체이너블 fake Supa. corpus_components/insights는 limit→then(배열), 나머지는 maybeSingle. */
function makeFakeSupa({ topicReason, audienceNeed, audienceLevel }: FakeOptions = {}): Supa {
  const extra: Record<string, string> = {};
  if (topicReason) extra.reason = topicReason;
  if (audienceNeed) extra.audience_need = audienceNeed;
  if (audienceLevel) extra.audience_level = audienceLevel;
  const topicSelection = Object.keys(extra).length
    ? { ...TOPIC_SELECTION, edited_payload: { ...TOPIC_SELECTION.edited_payload, ...extra } }
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
          return { data: { id: "prop-topic", candidates: [] }, error: null };
        case "stage_selections":
          return { data: topicSelection, error: null };
        case "tone_profile":
          return { data: null, error: null }; // 톤 없음
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

describe("prepareHookMaker 배선(통합) — 주제 맥락 조건부 주입", () => {
  const REASON = "적립식 투자에 대한 회의론이 커지는 시점(고조회 반론 영상 다수) — 이 각도를 직설로 되받아치는 주제";
  const NEED = "매달 넣고는 있는데 정말 이게 맞나 불안한 사람";
  const LEVEL = "초급";

  it("케이스 A: 주제 맥락(reason/audience_need/audience_level)이 있으면 input에 실리고 system에 HOOK_TOPIC_CONTEXT_DIRECTIVE 포함", async () => {
    const supa = makeFakeSupa({ topicReason: REASON, audienceNeed: NEED, audienceLevel: LEVEL });
    const { system, input } = await prepareHookMaker(supa, "run-A");

    expect(input.topic_reason).toBe(REASON);
    expect(input.audience_need).toBe(NEED);
    expect(input.audience_level).toBe(LEVEL);
    expect(system).toContain(HOOK_TOPIC_CONTEXT_DIRECTIVE);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
  });

  it("케이스 A2: 셋 중 일부(audience_need만)만 있어도 그 필드만 실리고 지시문은 포함된다", async () => {
    const supa = makeFakeSupa({ audienceNeed: NEED });
    const { system, input } = await prepareHookMaker(supa, "run-A2");

    expect(input.audience_need).toBe(NEED);
    expect("topic_reason" in input).toBe(false);
    expect("audience_level" in input).toBe(false);
    expect(system).toContain(HOOK_TOPIC_CONTEXT_DIRECTIVE);
  });

  it("케이스 B(회귀 가드): 주제 맥락이 없으면 input에 그 키들이 없고 system이 HOOK_MAKER_SYSTEM과 바이트 동일(promptHash 보존)", async () => {
    const supa = makeFakeSupa(); // 맥락·learned=[]·style=null → 순수 HOOK_MAKER_SYSTEM
    const { system, input } = await prepareHookMaker(supa, "run-B");

    expect("topic_reason" in input).toBe(false);
    expect("audience_need" in input).toBe(false);
    expect("audience_level" in input).toBe(false);
    expect(input.topic_reason).toBeUndefined();
    expect(system).toBe(HOOK_MAKER_SYSTEM); // 맥락·learned/style 없으면 바이트 동일
  });

  it("케이스 C: HOOK_MAKER_SYSTEM 본문에 HOOK_TOPIC_CONTEXT_DIRECTIVE가 없다(별도 상수) + 지시문에 핵심 문구(audience_need·시그니처·최우선·충돌) 존재", () => {
    expect(HOOK_MAKER_SYSTEM).not.toContain(HOOK_TOPIC_CONTEXT_DIRECTIVE);
    expect(HOOK_TOPIC_CONTEXT_DIRECTIVE).toContain("audience_need");
    expect(HOOK_TOPIC_CONTEXT_DIRECTIVE).toContain("시그니처");
    expect(HOOK_TOPIC_CONTEXT_DIRECTIVE).toContain("최우선");
    expect(HOOK_TOPIC_CONTEXT_DIRECTIVE).toContain("충돌");
  });
});
