// 회귀 가드 — 썸네일 상·하단 hook→how 골격 + 강도 상한 규칙이 SYSTEM 프롬프트에 박혀 있는지.
//   ★ 프롬프트 규칙의 존재(및 제거된 모순 문구의 부재)만 단언. 같은 토큰을 프롬프트·테스트가 공유한다.
import { describe, it, expect } from "vitest";
import { THUMBNAIL_MAKER_SYSTEM } from "../src/agents/thumbnail_maker/schema.js";

describe("썸네일 hook→how 골격 + 강도 상한 규칙 (회귀 가드)", () => {
  it("THUMBNAIL_MAKER_SYSTEM에 상·하단 hook→how 골격 규칙이 박혀 있다", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).toContain("상·하단 골격");
    expect(THUMBNAIL_MAKER_SYSTEM).toContain("하단=how");
  });

  it("제거된 모순 문구(각 줄 독립·연결 금지)를 더 이상 포함하지 않는다", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).not.toContain("각 줄을 따로 봐도");
  });

  it("THUMBNAIL_MAKER_SYSTEM에 강도 상한 규칙이 박혀 있다", () => {
    expect(THUMBNAIL_MAKER_SYSTEM).toContain("강도 상한");
  });
});
