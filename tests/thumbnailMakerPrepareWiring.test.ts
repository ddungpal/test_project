// 썸네일메이커 prepare 배선 통합 테스트(PhaseA Step1) — active 썸네일 스타일이 실제로 system/input에 주입되는지 '배선'을 못박는다.
//   ★ 스타일 주입 배선은 hook_maker → thumbnail_maker로 이동(제목 분리). 순수 함수(appendThumbnailStyle) 바이트 보존은 styleProfile.test.ts가 담당.
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 종료 메서드(maybeSingle / await)에서 테이블별 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareThumbnailMaker } from "../src/agents/thumbnail_maker/prepare.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — getSelectedStagePayload가 topic·title_thumb 둘 다 읽으므로(proposal→selection 각 1행) 둘 다 제공.
//   썸네일메이커는 topic(주제) + title_thumb(선택된 제목)을 모두 필요로 한다.
const TOPIC_PROPOSAL = { id: "prop-topic", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const TOPIC_SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };
const TITLE_PROPOSAL = { id: "prop-title", candidates: [{ idx: 0, payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } }] };
const TITLE_SELECTION = { chosen_idx: 0, edited_payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } };

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

/** 테이블명으로 분기하는 체이너블 fake Supa. stage_proposals/selections는 stage(eq 인자)로 topic/title 분기. */
function makeFakeSupa({ styleRow }: FakeOptions): Supa {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let stageFilter = ""; // eq("stage", ...)로 기록 — topic vs title_thumb 분기용
    let proposalFilter = ""; // eq("proposal_id", ...)로 기록 — selection을 어느 proposal에 매칭할지
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: unknown) => {
      if (col === "stage") stageFilter = String(val);
      if (col === "proposal_id") proposalFilter = String(val);
      return chain;
    };
    chain.in = self;
    chain.order = self;

    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          return { data: stageFilter === "title_thumb" ? TITLE_PROPOSAL : TOPIC_PROPOSAL, error: null };
        case "stage_selections":
          // selection은 proposal_id로 eq → 해당 proposal의 selection을 돌려준다(topic/title 분기).
          return { data: proposalFilter === TITLE_PROPOSAL.id ? TITLE_SELECTION : TOPIC_SELECTION, error: null };
        case "tone_profile":
          return { data: null, error: null };
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

describe("prepareThumbnailMaker 배선(통합) — active 썸네일 스타일 주입", () => {
  it("케이스 A: active 스타일이 있으면 system에 사양 섹션·style:id·patterns가 들어가고 input.style_profile이 세팅된다", async () => {
    const supa = makeFakeSupa({ styleRow: ACTIVE_STYLE_ROW });
    const { system, input } = await prepareThumbnailMaker(supa, "run-A");

    expect(system).toContain("김짠부 썸네일 스타일 사양");
    expect(system).toContain("style:uuid-style-7");
    expect(system).toContain("월급 그대로면 평생 이래요");
    expect(system).toContain("사색적 톤");

    expect(input.style_profile).toBeDefined();
    expect(input.style_profile?.id).toBe("style:uuid-style-7");
    expect(input.style_profile?.version).toBe(4);
    expect(input.style_profile?.patterns).toEqual(ACTIVE_STYLE_ROW.patterns);
    // 선택된 제목이 입력에 명시적으로 들어간다(썸네일은 이 제목을 강화).
    expect(input.selected_title).toBe("월급쟁이가 5천 모으는 가장 빠른 길");
  });

  it("케이스 B: active 스타일이 없으면(maybeSingle null) 스타일 섹션 없이 보존되고 input.style_profile은 미세팅", async () => {
    const supa = makeFakeSupa({ styleRow: null });
    const { system, input } = await prepareThumbnailMaker(supa, "run-B");

    expect(system).not.toContain("김짠부 썸네일 스타일 사양");
    expect(input.style_profile).toBeUndefined();
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    expect(input.selected_title).toBe("월급쟁이가 5천 모으는 가장 빠른 길");
  });
});
