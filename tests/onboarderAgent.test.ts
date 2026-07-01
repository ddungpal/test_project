// 쏙이(onboarder) 에이전트 회귀 가드 — SYSTEM 핵심 규칙 잠금 + role 레지스트리 등록.
//   copyQuestionRegister 스타일: 프롬프트 입구 규칙의 존재를 toContain으로 단언(같은 토큰을 프롬프트·테스트가 공유).
import { describe, it, expect } from "vitest";
import { ONBOARDER_SYSTEM } from "../src/agents/onboarder/schema.js";
import { ROLES } from "../src/agents/roles.js";

describe("ONBOARDER_SYSTEM 핵심 규칙 (회귀 가드)", () => {
  it("듀얼 훅(reversal/practical) 규칙이 박혀 있다", () => {
    expect(ONBOARDER_SYSTEM).toContain("reversal");
    expect(ONBOARDER_SYSTEM).toContain("practical");
  });

  it("클리프행어 아크 규칙이 박혀 있다", () => {
    expect(ONBOARDER_SYSTEM).toContain("클리프행어");
    expect(ONBOARDER_SYSTEM).toContain("cliffhanger");
  });

  it("난이도 태그(basic/mid/deep) 규칙이 박혀 있다", () => {
    expect(ONBOARDER_SYSTEM).toContain("basic/mid/deep");
  });

  it("미검증 수치는 unverifiedNumbers로 표시하는 규칙이 박혀 있다", () => {
    expect(ONBOARDER_SYSTEM).toContain("unverifiedNumbers");
    expect(ONBOARDER_SYSTEM).toContain("확인 필요");
  });

  it("억지 문항·날조 금지 규칙이 박혀 있다", () => {
    expect(ONBOARDER_SYSTEM).toContain("억지");
    expect(ONBOARDER_SYSTEM).toContain("날조 금지");
  });

  it("정중-탐문형 종결 금지 규칙이 박혀 있다(hook_maker와 정렬)", () => {
    expect(ONBOARDER_SYSTEM).toContain("정중-탐문");
    expect(ONBOARDER_SYSTEM).toContain("~셨나요");
  });
});

describe("onboarder role 레지스트리 등록", () => {
  it("onboarder role이 존재하고 name '쏙이'·opus·tools 빈배열이다", () => {
    const role = ROLES.onboarder;
    expect(role).toBeDefined();
    expect(role.roleId).toBe("onboarder");
    expect(role.name).toBe("쏙이");
    expect(role.defaultModel).toBe("opus");
    expect(role.tools).toEqual([]);
  });
});
