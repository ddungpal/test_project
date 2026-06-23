// 훅이 prepare 배선 통합 테스트(PhaseA Step1) — active 썸네일 스타일이 실제로 system/input에 주입되는지 '배선'을 못박는다.
//   순수 함수(appendThumbnailStyle)의 바이트 보존은 styleProfile.test.ts가 이미 담당 → 여기서는 prepare → loadActiveThumbnailStyle → appendThumbnailStyle 연결만 단언(중복 금지).
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 종료 메서드(maybeSingle / await)에서 테이블별 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareHookMaker } from "../src/agents/hook_maker/prepare.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload를 내놓기 위한 최소 stage_proposals / stage_selections 구성.
//   getSelectedStagePayload: proposal(maybeSingle) → selection(maybeSingle) → edited_payload 우선.
const PROPOSAL_ROW = { id: "prop-1", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const SELECTION_ROW = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

const ACTIVE_STYLE_ROW = {
  id: "uuid-style-7",
  version: 4,
  patterns: {
    copy: { hook_patterns: ["월급 그대로면 평생 이래요"], length_notes: "12자 이내" },
    visual: { face: "정면 클로즈업" },
    banned: ["사색적 톤", "잔잔한 배경"],
  },
};

interface FakeOptions {
  styleRow: unknown | null; // style_profiles active 1행(maybeSingle) — null이면 active 없음
}

/** 테이블명으로 분기하는 체이너블 fake Supa. 종료 메서드에서만 실제 값을 돌려준다. */
function makeFakeSupa({ styleRow }: FakeOptions): Supa {
  const from = (table: string) => {
    // 모든 빌더 메서드가 같은 체이너를 돌려준다. 종료(maybeSingle/await)에서 테이블별 데이터 확정.
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.in = self;
    chain.order = self;

    // maybeSingle: 단일 행 종료. 테이블별 분기.
    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          return { data: PROPOSAL_ROW, error: null };
        case "stage_selections":
          return { data: SELECTION_ROW, error: null };
        case "tone_profile":
          return { data: null, error: null }; // active/latest 모두 없음 → tone:null
        case "style_profiles":
          return { data: styleRow, error: null };
        default:
          return { data: null, error: null };
      }
    };

    // limit: corpus_components는 await(thenable), 나머지는 다시 체이너(뒤에 maybeSingle/order).
    chain.limit = (..._args: unknown[]) => {
      if (table === "corpus_components" || table === "insights") {
        // await로 소비되는 thenable — { data, error } 해소.
        const data = table === "corpus_components" ? [] : []; // 둘 다 빈 결과(스타일 배선만 검증)
        return { ...chain, then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }) };
      }
      return chain;
    };

    return chain;
  };
  return { from } as unknown as Supa;
}

describe("prepareHookMaker 배선(통합) — active 썸네일 스타일 주입", () => {
  it("케이스 A: active 스타일이 있으면 system에 사양 섹션·style:id·patterns가 들어가고 input.style_profile이 세팅된다", async () => {
    const supa = makeFakeSupa({ styleRow: ACTIVE_STYLE_ROW });
    const { system, input } = await prepareHookMaker(supa, "run-A");

    // 배선: loadActiveThumbnailStyle → appendThumbnailStyle 까지 연결됐는지.
    expect(system).toContain("김짠부 썸네일 스타일 사양");
    expect(system).toContain("style:uuid-style-7"); // loadActiveThumbnailStyle이 id에 'style:' 접두를 붙인다
    expect(system).toContain("월급 그대로면 평생 이래요"); // patterns 내용이 직렬화돼 들어감
    expect(system).toContain("사색적 톤");

    expect(input.style_profile).toBeDefined();
    expect(input.style_profile?.id).toBe("style:uuid-style-7");
    expect(input.style_profile?.version).toBe(4);
    expect(input.style_profile?.patterns).toEqual(ACTIVE_STYLE_ROW.patterns);
  });

  it("케이스 B: active 스타일이 없으면(maybeSingle null) 스타일 섹션 없이 보존되고 input.style_profile은 미세팅", async () => {
    const supa = makeFakeSupa({ styleRow: null });
    const { system, input } = await prepareHookMaker(supa, "run-B");

    expect(system).not.toContain("김짠부 썸네일 스타일 사양");
    expect(input.style_profile).toBeUndefined();
    // 주제 배선은 정상(throw 없이 topic 세팅)이어야 케이스 B가 의미 있다.
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
  });
});
