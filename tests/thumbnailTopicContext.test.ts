// 썸네일메이커(thumbnail_maker) prepare 배선(통합) 테스트 — 주제 맥락(topic_reason·audience_need·audience_level) 조건부 주입(topic-context-to-copy step1).
//   hookTopicContext.test.ts 구조 미러 + thumbnailPersona.test.ts의 fake Supa 패턴(topic·title_thumb 둘 다 읽음).
//   주제 맥락 있으면 input/system에 주입, 없으면 바이트 불변(회귀 가드).
//   ★ ab_variants(winner)는 .select().eq().eq()로 끝나 await된다 — chain을 thenable로 안 만들면 rows=[] → 조기 return [](promptHash 불변).
import { describe, it, expect } from "vitest";
import { prepareThumbnailMaker } from "../src/agents/thumbnail_maker/prepare.js";
import { THUMBNAIL_MAKER_SYSTEM, THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE } from "../src/agents/thumbnail_maker/schema.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — thumbnail_maker는 topic·title_thumb 둘 다 읽는다(getSelectedStagePayload 2회). 둘 다 title 필요.
const SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

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
  // topic·title_thumb 둘 다 이 selection을 받는다(fake는 stage 구분 없음). 맥락은 topic에만 의미 있으나 둘 다 실려도 title 추출엔 무해.
  const selection = Object.keys(extra).length
    ? { ...SELECTION, edited_payload: { ...SELECTION.edited_payload, ...extra } }
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

describe("prepareThumbnailMaker 배선(통합) — 주제 맥락 조건부 주입", () => {
  const REASON = "적립식 투자에 대한 회의론이 커지는 시점(고조회 반론 영상 다수) — 이 각도를 직설로 되받아치는 주제";
  const NEED = "매달 넣고는 있는데 정말 이게 맞나 불안한 사람";
  const LEVEL = "초급";

  it("케이스 A: 주제 맥락(reason/audience_need/audience_level)이 있으면 input에 실리고 system에 THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE 포함", async () => {
    const supa = makeFakeSupa({ topicReason: REASON, audienceNeed: NEED, audienceLevel: LEVEL });
    const { system, input } = await prepareThumbnailMaker(supa, "run-A");

    expect(input.topic_reason).toBe(REASON);
    expect(input.audience_need).toBe(NEED);
    expect(input.audience_level).toBe(LEVEL);
    expect(system).toContain(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
    expect(input.selected_title).toBe("연봉 3천 이하 무조건 보세요"); // title_thumb 추출 불변
  });

  it("케이스 A2: 셋 중 일부(audience_need만)만 있어도 그 필드만 실리고 지시문은 포함된다", async () => {
    const supa = makeFakeSupa({ audienceNeed: NEED });
    const { system, input } = await prepareThumbnailMaker(supa, "run-A2");

    expect(input.audience_need).toBe(NEED);
    expect("topic_reason" in input).toBe(false);
    expect("audience_level" in input).toBe(false);
    expect(system).toContain(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE);
  });

  it("케이스 B(회귀 가드): 주제 맥락이 없으면 input에 그 키들이 없고 system이 THUMBNAIL_MAKER_SYSTEM과 바이트 동일(promptHash 보존)", async () => {
    const supa = makeFakeSupa(); // 맥락·learned=[]·style=null·winning=[] → 순수 THUMBNAIL_MAKER_SYSTEM
    const { system, input } = await prepareThumbnailMaker(supa, "run-B");

    expect("topic_reason" in input).toBe(false);
    expect("audience_need" in input).toBe(false);
    expect("audience_level" in input).toBe(false);
    expect(input.topic_reason).toBeUndefined();
    expect(system).toBe(THUMBNAIL_MAKER_SYSTEM); // 맥락·learned/style/winning 없으면 바이트 동일
  });

  it("케이스 C: THUMBNAIL_MAKER_SYSTEM 본문에 THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE가 없다(별도 상수) + 지시문에 핵심 문구(audience_need·시그니처·최우선·충돌) 존재", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).not.toContain(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE);
    expect(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE).toContain("audience_need");
    expect(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE).toContain("시그니처");
    expect(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE).toContain("최우선");
    expect(THUMBNAIL_TOPIC_CONTEXT_DIRECTIVE).toContain("충돌");
  });
});
