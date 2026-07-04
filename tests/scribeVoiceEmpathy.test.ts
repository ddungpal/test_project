// 회귀 가드: 짠펜 SCRIBE_SYSTEM에 '목소리 강제'(시그니처 워딩/말버릇 박아 쓰기)와
//   '공감대·흥미'(시청자 후킹 지점) 규칙이 남아있는지. 프롬프트 회귀로 이 두 지시가 빠지면 잡는다.
import { describe, it, expect } from "vitest";
import { SCRIBE_SYSTEM } from "../src/agents/scribe/schema.js";

describe("scribe SCRIBE_SYSTEM: 목소리 강제·공감대", () => {
  it("목소리 강제 규칙을 포함한다", () => {
    expect(SCRIBE_SYSTEM).toContain("목소리 강제");
  });
  it("공감대·흥미 규칙을 포함한다", () => {
    expect(SCRIBE_SYSTEM).toContain("공감대·흥미");
  });
});
