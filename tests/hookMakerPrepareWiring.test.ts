// 훅이 prepare 배선 통합 테스트(제목 전용) — 제목 단계는 썸네일 스타일을 주입하지 않음을 못박는다.
//   ★ 스타일 주입 배선은 thumbnail_maker로 이동(thumbnailMakerPrepareWiring.test.ts). 여기선 '주입 안 함' + 기본 배선만 검증.
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 종료 메서드(maybeSingle / await)에서 테이블별 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareHookMaker } from "../src/agents/hook_maker/prepare.js";
import type { Supa } from "../src/pipeline/runState.js";

const PROPOSAL_ROW = { id: "prop-1", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const SELECTION_ROW = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };

// 썸네일 스타일이 active로 존재해도 훅이(제목)는 이를 무시해야 한다.
const ACTIVE_STYLE_ROW = {
  id: "uuid-style-7",
  version: 4,
  patterns: { copy: { hook_patterns: ["월급 그대로면 평생 이래요"] }, banned: ["사색적 톤"] },
};

interface FakeOptions {
  styleRow: unknown | null;
}

/** 테이블명으로 분기하는 체이너블 fake Supa. 종료 메서드에서만 실제 값을 돌려준다. */
function makeFakeSupa({ styleRow }: FakeOptions): Supa {
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

describe("prepareHookMaker 배선(통합) — 제목 전용, 썸네일 스타일 미주입", () => {
  it("active 썸네일 스타일이 있어도 system에 스타일 사양 섹션이 들어가지 않는다(제목 단계)", async () => {
    const supa = makeFakeSupa({ styleRow: ACTIVE_STYLE_ROW });
    const { system, input } = await prepareHookMaker(supa, "run-A");

    expect(system).not.toContain("김짠부 썸네일 스타일 사양");
    expect(system).not.toContain("style:uuid-style-7");
    // 기본 배선은 정상 — 주제가 입력에 세팅된다.
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    // HookMakerInput에는 style_profile 필드 자체가 없다(제목 분리).
    expect((input as unknown as Record<string, unknown>).style_profile).toBeUndefined();
  });

  it("active 스타일이 없어도 동일하게 보존 — throw 없이 topic 세팅", async () => {
    const supa = makeFakeSupa({ styleRow: null });
    const { system, input } = await prepareHookMaker(supa, "run-B");

    expect(system).not.toContain("김짠부 썸네일 스타일 사양");
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
  });
});
