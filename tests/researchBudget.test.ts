// researchBudget 순수 헬퍼 테스트 — '기본 선택 개수' 힌트(상한 아님)의 섹션 비례·floor/ceiling·경계.
import { describe, it, expect } from "vitest";
import { countOutlineSections, suggestDefaultSelection, type ResearchBudgetConfig } from "../src/pipeline/researchBudget.js";

const CFG: ResearchBudgetConfig = { claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 };

describe("countOutlineSections", () => {
  it("{outline:[...]} 길이를 센다", () => {
    expect(countOutlineSections({ outline: [{ section: "a" }, { section: "b" }, { section: "c" }] })).toBe(3);
  });
  it("못 읽으면 0 — null·미배열·빈 객체·문자열", () => {
    expect(countOutlineSections(null)).toBe(0);
    expect(countOutlineSections(undefined)).toBe(0);
    expect(countOutlineSections({})).toBe(0);
    expect(countOutlineSections({ outline: "nope" })).toBe(0);
    expect(countOutlineSections("string")).toBe(0);
  });
  it("빈 outline 배열은 0", () => {
    expect(countOutlineSections({ outline: [] })).toBe(0);
  });
});

describe("suggestDefaultSelection", () => {
  it("섹션 비례로 산출(반올림)", () => {
    // 4섹션: claims=4*1.5=6, concepts=4*1=4 (둘 다 floor~ceiling 안)
    expect(suggestDefaultSelection(4, CFG)).toEqual({ claims: 6, concepts: 4 });
  });
  it("ceiling으로 클램프(많은 섹션)", () => {
    // 10섹션: claims=15→ceiling 8, concepts=10→ceiling 8
    expect(suggestDefaultSelection(10, CFG)).toEqual({ claims: 8, concepts: 8 });
  });
  it("floor로 클램프(섹션 0)", () => {
    // sectionCount=0 경계 → 둘 다 floor
    expect(suggestDefaultSelection(0, CFG)).toEqual({ claims: 2, concepts: 2 });
  });
  it("작은 섹션은 floor로 끌어올림", () => {
    // 1섹션: claims=1.5→2(반올림 후 floor 2 동률), concepts=1→floor 2
    expect(suggestDefaultSelection(1, CFG)).toEqual({ claims: 2, concepts: 2 });
  });
  it("음수·비유한 sectionCount는 0으로 취급 → floor", () => {
    expect(suggestDefaultSelection(-3, CFG)).toEqual({ claims: 2, concepts: 2 });
    expect(suggestDefaultSelection(Number.NaN, CFG)).toEqual({ claims: 2, concepts: 2 });
  });
  it("상한이 아니라 '기본 선택' 의미 — 큰 섹션에서도 ceiling을 넘지 않는다", () => {
    const r = suggestDefaultSelection(100, CFG);
    expect(r.claims).toBeLessThanOrEqual(CFG.ceiling);
    expect(r.concepts).toBeLessThanOrEqual(CFG.ceiling);
  });
});
