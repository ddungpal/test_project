// 훅이 prepare 배선 통합 테스트(제목 전용) — 제목 단계는 썸네일 스타일을 주입하지 않고,
//   active 'title' 스타일이 있을 때만 조건부로 제목 스타일 사양을 주입한다(copy-learning-admin step1).
//   ★ 썸네일 스타일 주입 배선은 thumbnail_maker로 이동(thumbnailMakerPrepareWiring.test.ts).
//   fake Supa: 테이블명 + component_type 필터로 분기하는 체이너블 스텁. 종료 메서드에서 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareHookMaker } from "../src/agents/hook_maker/prepare.js";
import type { Supa } from "../src/pipeline/runState.js";

const PROPOSAL_ROW = { id: "prop-1", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const SELECTION_ROW = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

// active 'title' 스타일 프로필(component_type='title'). 활성 시에만 제목 스타일 사양을 주입.
const ACTIVE_TITLE_STYLE_ROW = {
  id: "uuid-title-7",
  version: 4,
  patterns: { copy: { hook_patterns: ["월급 그대로면 평생 이래요"] }, banned: ["사색적 톤"] },
};

interface FakeOptions {
  /** component_type='title' 조회에 돌려줄 row. null 이면 활성 제목 프로필 없음(현재 기본 상태). */
  titleStyleRow: unknown | null;
}

/** 테이블명 + style_profiles 의 component_type 필터로 분기하는 체이너블 fake Supa. */
function makeFakeSupa({ titleStyleRow }: FakeOptions): Supa {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let componentType: string | null = null;
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: string) => {
      if (table === "style_profiles" && col === "component_type") componentType = val;
      return chain;
    };
    chain.in = self;
    chain.order = self;

    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          return { data: PROPOSAL_ROW, error: null };
        case "stage_selections":
          return { data: SELECTION_ROW, error: null };
        case "tone_profile":
          return { data: null, error: null }; // active/latest 모두 없음 → tone:null
        case "style_profiles":
          // 훅이는 component_type='title' 만 읽는다. thumbnail_copy 조회는 발생하지 않음.
          return { data: componentType === "title" ? titleStyleRow : null, error: null };
        default:
          return { data: null, error: null };
      }
    };

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

describe("prepareHookMaker 배선(통합) — 제목 스타일 조건부 주입", () => {
  it("active 제목 프로필이 없으면 system/입력 보존 — 썸네일·제목 스타일 사양 모두 미주입(픽스처 해시 보존)", async () => {
    const supa = makeFakeSupa({ titleStyleRow: null });
    const { system, input } = await prepareHookMaker(supa, "run-B");

    expect(system).not.toContain("김짠부 썸네일 스타일 사양");
    expect(system).not.toContain("김짠부 제목 스타일 사양");
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    // 활성 제목 프로필 없으면 style_profile 필드 부재(promptHash 불변).
    expect((input as unknown as Record<string, unknown>).style_profile).toBeUndefined();
  });

  it("active 제목 프로필이 있으면 제목 스타일 사양을 주입한다(썸네일 사양은 여전히 미주입)", async () => {
    const supa = makeFakeSupa({ titleStyleRow: ACTIVE_TITLE_STYLE_ROW });
    const { system, input } = await prepareHookMaker(supa, "run-A");

    expect(system).toContain("김짠부 제목 스타일 사양");
    expect(system).not.toContain("김짠부 썸네일 스타일 사양"); // 제목 단계는 썸네일 사양 안 씀
    expect(system).toContain("style:uuid-title-7");
    expect(system).toContain("월급 그대로면 평생 이래요");
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    // 활성 제목 프로필 있으면 style_profile 주입.
    expect(input.style_profile?.id).toBe("style:uuid-title-7");
  });
});
