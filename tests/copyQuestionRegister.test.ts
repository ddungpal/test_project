// 회귀 가드 — 정중-탐문형 질문 어미 금지 규칙이 두 SYSTEM 프롬프트에 박혀 있는지.
//   ★ 프롬프트 입구 차단(말투 규칙)의 존재만 단언. 같은 토큰을 프롬프트·테스트가 공유한다.
import { describe, it, expect } from "vitest";
import { THUMBNAIL_MAKER_SYSTEM } from "../src/agents/thumbnail_maker/schema.js";
import { HOOK_MAKER_SYSTEM } from "../src/agents/hook_maker/schema.js";

describe("정중-탐문형 질문 어미 금지 규칙 (회귀 가드)", () => {
  it("THUMBNAIL_MAKER_SYSTEM에 정중-탐문 금지 규칙이 박혀 있다", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).toContain("정중-탐문");
    expect(THUMBNAIL_MAKER_SYSTEM).toContain("~셨나요");
  });

  it("HOOK_MAKER_SYSTEM에 정중-탐문 금지 규칙이 박혀 있다", () => {
    expect(HOOK_MAKER_SYSTEM).toContain("정중-탐문");
    expect(HOOK_MAKER_SYSTEM).toContain("~셨나요");
  });
});
