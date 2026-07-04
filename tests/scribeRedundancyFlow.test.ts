// 짠펜 대본 품질 회귀 가드 — 프롬프트 입구에서 막는 두 규칙이 SCRIBE_SYSTEM에 상존하는지 단언.
//   ① 중복 금지(같은 의미 되풀이 금지) ② 자연스러운 연결(낭독 기준 흐름 유지).
//   사후 검사·2차 편집 패스는 없다(YAGNI) — 프롬프트 문구가 곧 계약이므로 안정 토큰으로 가드한다.
import { describe, it, expect } from "vitest";
import { SCRIBE_SYSTEM } from "../src/agents/scribe/schema.js";

describe("SCRIBE_SYSTEM 대본 품질 규칙(redundancy-flow)", () => {
  it("규칙① 중복 금지 규칙이 프롬프트에 있다", () => {
    expect(SCRIBE_SYSTEM).toContain("중복 금지");
  });

  it("규칙② 자연스러운 연결(낭독 기준) 규칙이 프롬프트에 있다", () => {
    expect(SCRIBE_SYSTEM).toContain("낭독 기준");
  });
});
