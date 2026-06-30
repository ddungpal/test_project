// 구다리(structurer) prepare 배선 통합 테스트(structure-style-learning Step1) —
//   active 구성 스타일(style_profiles component_type='structure')이 실제로 system/input에 주입되는지 '배선'을 못박는다.
//   ★ thumbnailMakerPrepareWiring 미러. 순수 함수(appendStructureStyle) 바이트 보존은 styleProfile.test.ts가 담당.
//   fake Supa: 테이블명으로 분기하는 체이너블 스텁. 종료 메서드(maybeSingle / await)에서 테이블별 고정 데이터를 돌려준다.
import { describe, it, expect } from "vitest";
import { prepareStructurer } from "../src/agents/structurer/prepare.js";
import { STRUCTURER_SYSTEM } from "../src/agents/structurer/schema.js";
import type { Supa } from "../src/pipeline/runState.js";

// (run, stage) 선택 payload — getSelectedStagePayload가 topic·title_thumb 둘 다 읽으므로(proposal→selection 각 1행) 둘 다 제공.
const TOPIC_PROPOSAL = { id: "prop-topic", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const TOPIC_SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };
const TITLE_PROPOSAL = { id: "prop-title", candidates: [{ idx: 0, payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } }] };
const TITLE_SELECTION = { chosen_idx: 0, edited_payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } };

const ACTIVE_STRUCTURE_ROW = {
  id: "uuid-struct-9",
  version: 3,
  patterns: {
    section_archetypes: ["공감형 오프닝", "사례 먼저", "실행 체크리스트"],
    flow_principles: ["쉬운 것 먼저", "공감→정보→실행"],
    hook_placement: "첫 10초 안에 공감 훅",
    anxiety_relief: "어려운 용어 직전에 안심 한 마디",
    misconception_handling: "흔한 오해를 사례로 먼저 깬다",
    ordering_notes: "공감→정보→실행 순",
    banned: ["사색적 여백형 전개"],
  },
};

interface FakeOptions {
  structureRow: unknown | null; // style_profiles active 1행(maybeSingle) — null이면 active 없음
  styleEqLog?: string[]; // style_profiles에서 eq("component_type", ...) 인자 기록(structure만 읽는지 검증)
  topicPersona?: string; // topic selection의 edited_payload에 실을 target_persona(없으면 기존처럼 persona 미포함)
}

/** 테이블명으로 분기하는 체이너블 fake Supa. stage_proposals/selections는 stage(eq 인자)로 topic/title 분기. */
function makeFakeSupa({ structureRow, styleEqLog, topicPersona }: FakeOptions): Supa {
  // topic selection의 edited_payload — persona 옵션이 있으면 그것만 추가(없으면 기존 바이트 동일).
  const topicSelection = topicPersona
    ? { ...TOPIC_SELECTION, edited_payload: { ...TOPIC_SELECTION.edited_payload, target_persona: topicPersona } }
    : TOPIC_SELECTION;
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let stageFilter = ""; // eq("stage", ...) — topic vs title_thumb 분기
    let proposalFilter = ""; // eq("proposal_id", ...) — selection 매칭
    const self = () => chain;
    chain.select = self;
    chain.eq = (col: string, val: unknown) => {
      if (col === "stage") stageFilter = String(val);
      if (col === "proposal_id") proposalFilter = String(val);
      if (col === "component_type" && table === "style_profiles" && styleEqLog) styleEqLog.push(String(val));
      return chain;
    };
    chain.in = self;
    chain.order = self;

    chain.maybeSingle = async () => {
      switch (table) {
        case "stage_proposals":
          return { data: stageFilter === "title_thumb" ? TITLE_PROPOSAL : TOPIC_PROPOSAL, error: null };
        case "stage_selections":
          return { data: proposalFilter === TITLE_PROPOSAL.id ? TITLE_SELECTION : topicSelection, error: null };
        case "tone_profile":
          return { data: null, error: null };
        case "style_profiles":
          return { data: structureRow, error: null };
        default:
          return { data: null, error: null };
      }
    };

    chain.limit = (..._args: unknown[]) => {
      if (table === "insights") {
        return { ...chain, then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }) };
      }
      return chain;
    };

    return chain;
  };
  return { from } as unknown as Supa;
}

describe("prepareStructurer 배선(통합) — active 구성 스타일 주입", () => {
  it("케이스 A: active 구성 스타일이 있으면 system에 사양 섹션·style:id·patterns가 들어가고 input.structure_style_profile이 세팅된다", async () => {
    const supa = makeFakeSupa({ structureRow: ACTIVE_STRUCTURE_ROW });
    const { system, input } = await prepareStructurer(supa, "run-A");

    expect(system).toContain("김짠부 구성 사양");
    expect(system).toContain("style:uuid-struct-9");
    expect(system).toContain("공감형 오프닝");
    expect(system).toContain("사색적 여백형 전개"); // banned 포함

    expect(input.structure_style_profile).toBeDefined();
    expect(input.structure_style_profile?.id).toBe("style:uuid-struct-9");
    expect(input.structure_style_profile?.version).toBe(3);
    expect(input.structure_style_profile?.patterns).toEqual(ACTIVE_STRUCTURE_ROW.patterns);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
    expect(input.title).toBe("월급쟁이가 5천 모으는 가장 빠른 길");
  });

  it("케이스 B: active 구성 스타일이 없으면(maybeSingle null) SYSTEM 바이트 불변이고 input.structure_style_profile은 미세팅", async () => {
    const supa = makeFakeSupa({ structureRow: null });
    const { system, input } = await prepareStructurer(supa, "run-B");

    expect(system).toBe(STRUCTURER_SYSTEM); // active 없으면 기존과 바이트 동일(promptHash 불변)
    expect(input.structure_style_profile).toBeUndefined();
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요");
  });

  it("케이스 C: style_profiles를 component_type='structure'로만 쿼리한다(thumbnail/title 아님)", async () => {
    const styleEqLog: string[] = [];
    const supa = makeFakeSupa({ structureRow: null, styleEqLog });
    await prepareStructurer(supa, "run-C");
    expect(styleEqLog).toContain("structure");
    expect(styleEqLog).not.toContain("thumbnail_copy");
    expect(styleEqLog).not.toContain("title");
  });
});

describe("prepareStructurer 배선(통합) — target_persona 조건부 주입", () => {
  const PERSONA = "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람";

  it("케이스 D: topic payload에 target_persona가 있으면 input.target_persona에 그 값이 실린다", async () => {
    const supa = makeFakeSupa({ structureRow: null, topicPersona: PERSONA });
    const { input } = await prepareStructurer(supa, "run-D");

    expect(input.target_persona).toBe(PERSONA);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 title 추출 불변
  });

  it("케이스 E(회귀 가드): persona가 없으면 input에 target_persona 키 자체가 없다(바이트 불변 → 픽스처 해시 보존)", async () => {
    const supa = makeFakeSupa({ structureRow: null }); // topicPersona 미지정
    const { input } = await prepareStructurer(supa, "run-E");

    expect("target_persona" in input).toBe(false);
    expect(input.target_persona).toBeUndefined();
  });

  it("케이스 F: STRUCTURER_SYSTEM에 target_persona 대상 맞춤 지시 문구가 있다(정적 프롬프트)", () => {
    expect(STRUCTURER_SYSTEM).toContain("target_persona");
  });
});
