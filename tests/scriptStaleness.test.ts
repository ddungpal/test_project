// isScriptDownstreamStarted(순수) — approved/published에서만 true, 그 외 false.
//   outline staleness(isStructureDownstreamStarted) 미러. 컴포넌트 아닌 lib에 둬 vitest(.js 상대경로)로 검증.
import { describe, it, expect } from "vitest";
import { isScriptDownstreamStarted } from "../src/lib/script/staleness.js";
import { RUN_STATES } from "../src/domain/enums.js";

describe("isScriptDownstreamStarted — 스크립트 다운스트림(완료·게시) 판정", () => {
  it("approved·published면 true", () => {
    expect(isScriptDownstreamStarted("approved")).toBe(true);
    expect(isScriptDownstreamStarted("published")).toBe(true);
  });

  it("script_review·scripting·그 이전은 false(대본이 아직 유동적)", () => {
    expect(isScriptDownstreamStarted("script_review")).toBe(false);
    expect(isScriptDownstreamStarted("scripting")).toBe(false);
    expect(isScriptDownstreamStarted("script_ready")).toBe(false);
    expect(isScriptDownstreamStarted("research_approved")).toBe(false);
    expect(isScriptDownstreamStarted("structure_selected")).toBe(false);
    expect(isScriptDownstreamStarted("created")).toBe(false);
  });

  it("approved·published 외 모든 상태는 false(전수)", () => {
    for (const s of RUN_STATES) {
      const expected = s === "approved" || s === "published";
      expect(isScriptDownstreamStarted(s)).toBe(expected);
    }
  });
});
