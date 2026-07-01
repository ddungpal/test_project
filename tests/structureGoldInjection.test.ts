// 구다리(structurer) prepare — 쏙이 온보딩 금맥(OnboardingGold) 조건부 주입 배선 테스트(structure-gold-injection).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "D. 금맥 → 구다리 주입".
//   ★ target_persona 조건부 주입(structurerPrepareWiring.test) 미러 — 금맥 있음→주입, 없음→바이트 불변(픽스처 해시 보존).
//   fake Supa: 테이블명+stage/proposal_id 필터로 분기하는 체이너블 스텁. 금맥은 onboarding proposal의 stage_selection.edited_payload에서 읽는다.
import { describe, it, expect } from "vitest";
import { prepareStructurer } from "../src/agents/structurer/prepare.js";
import { STRUCTURER_SYSTEM } from "../src/agents/structurer/schema.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { OnboardingGold } from "../src/agents/onboarder/schema.js";

// 선택된 주제·제목(getSelectedStagePayload가 topic·title_thumb 둘 다 읽음).
const TOPIC_PROPOSAL = { id: "prop-topic", candidates: [{ idx: 0, payload: { title: "연봉 3천 이하 무조건 보세요" } }] };
const TOPIC_SELECTION = { chosen_idx: 0, edited_payload: { title: "연봉 3천 이하 무조건 보세요" } };
const TITLE_PROPOSAL = { id: "prop-title", candidates: [{ idx: 0, payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } }] };
const TITLE_SELECTION = { chosen_idx: 0, edited_payload: { title: "월급쟁이가 5천 모으는 가장 빠른 길" } };

// 온보딩 proposal(loadOnboardingGold가 stage="onboarding"으로 찾음) + 그 selection.edited_payload = 금맥.
const ONBOARDING_PROPOSAL = { id: "prop-onboarding" };
const GOLD: OnboardingGold = {
  confusionPoints: ["예금이 항상 안전하다고 생각하는 지점", "복리를 단리로 착각하는 지점"],
  ahaPoints: ["좋아 보이던 예금이 사실 물가 대비 손해였다", "적금보다 파킹통장이 유리한 경우"],
  coreAngle: "예금만 믿다간 물가에 잠식된다 — 통장 쪼개기부터",
  calibratedLevel: "novice",
};

interface FakeOptions {
  gold?: OnboardingGold; // 있으면 onboarding proposal + selection(edited_payload=gold) 제공, 없으면 onboarding proposal 자체 없음(금맥 미주입)
  proposalNoSelection?: boolean; // true면 onboarding proposal은 반환하되 selection.edited_payload=null(금맥 미저장 경로)
}

/** 테이블명 + stage/proposal_id 필터로 분기하는 체이너블 fake Supa. */
function makeFakeSupa({ gold, proposalNoSelection }: FakeOptions): Supa {
  const hasOnboardingProposal = Boolean(gold) || Boolean(proposalNoSelection); // proposal 존재 여부(금맥 유무와 별개)
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let stageFilter = ""; // eq("stage", ...) — topic/title_thumb/onboarding 분기
    let proposalFilter = ""; // eq("proposal_id", ...) — selection 매칭
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
        case "stage_proposals": {
          if (stageFilter === "title_thumb") return { data: TITLE_PROPOSAL, error: null };
          if (stageFilter === "onboarding") return { data: hasOnboardingProposal ? ONBOARDING_PROPOSAL : null, error: null };
          return { data: TOPIC_PROPOSAL, error: null };
        }
        case "stage_selections": {
          if (proposalFilter === TITLE_PROPOSAL.id) return { data: TITLE_SELECTION, error: null };
          // onboarding proposal의 selection: 금맥 있으면 edited_payload=gold, proposalNoSelection이면 edited_payload=null(미저장 경로)
          if (proposalFilter === ONBOARDING_PROPOSAL.id) return { data: { edited_payload: gold ?? null }, error: null };
          return { data: TOPIC_SELECTION, error: null }; // topic selection
        }
        case "tone_profile":
          return { data: null, error: null };
        case "style_profiles":
          return { data: null, error: null }; // active 구성 스타일 없음(SYSTEM 바이트 불변)
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

describe("prepareStructurer 배선(통합) — 온보딩 금맥 조건부 주입", () => {
  it("케이스 A: 금맥이 있으면 input.onboardingGold에 confusion/aha/coreAngle/level이 실린다", async () => {
    const supa = makeFakeSupa({ gold: GOLD });
    const { input } = await prepareStructurer(supa, "run-gold");

    expect(input.onboardingGold).toBeDefined();
    expect(input.onboardingGold?.confusionPoints).toEqual(GOLD.confusionPoints);
    expect(input.onboardingGold?.ahaPoints).toEqual(GOLD.ahaPoints);
    expect(input.onboardingGold?.coreAngle).toBe(GOLD.coreAngle);
    expect(input.onboardingGold?.calibratedLevel).toBe(GOLD.calibratedLevel);
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
    expect(input.title).toBe("월급쟁이가 5천 모으는 가장 빠른 길");
  });

  it("케이스 B(회귀 가드): 금맥이 없으면 input에 onboardingGold 키 자체가 없다(바이트 불변 → 픽스처 해시 보존)", async () => {
    const supa = makeFakeSupa({}); // 금맥 미지정 → onboarding proposal 없음
    const { input } = await prepareStructurer(supa, "run-nogold");

    expect("onboardingGold" in input).toBe(false);
    expect(input.onboardingGold).toBeUndefined();
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
  });

  it("케이스 B2(회귀 가드): onboarding proposal은 있지만 selection.edited_payload가 없으면(금맥 미저장) input에 onboardingGold 키가 없다(바이트 불변)", async () => {
    const supa = makeFakeSupa({ proposalNoSelection: true }); // proposal 존재·edited_payload=null → loadOnboardingGold의 payload falsy 가드 경로
    const { input } = await prepareStructurer(supa, "run-nosel");

    expect("onboardingGold" in input).toBe(false);
    expect(input.onboardingGold).toBeUndefined();
    expect(input.topic).toBe("연봉 3천 이하 무조건 보세요"); // 기존 topic 추출 불변
  });

  it("케이스 C: STRUCTURER_SYSTEM에 금맥 활용 지침 문구가 있다(정적 프롬프트)", () => {
    expect(STRUCTURER_SYSTEM).toContain("onboardingGold");
    expect(STRUCTURER_SYSTEM).toContain("confusionPoints");
    expect(STRUCTURER_SYSTEM).toContain("ahaPoints");
    expect(STRUCTURER_SYSTEM).toContain("coreAngle");
    expect(STRUCTURER_SYSTEM).toContain("calibratedLevel");
  });
});
