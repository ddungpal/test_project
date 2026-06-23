// 환류(Phase 4 슬라이스 4) 단위 테스트 — 순수 필터/포맷터. DB 조회는 라이브 검증.
import { describe, it, expect } from "vitest";
import { filterValidInsights, appendLearnedInsights, type LearnedInsight } from "../src/agents/shared/approvedInsights.js";

describe("유효기간 필터(filterValidInsights)", () => {
  const rows = [
    { id: "a", valid_until: null },
    { id: "b", valid_until: "2026-12-31" },
    { id: "c", valid_until: "2026-01-01" }, // asOf 이전 만료
  ];
  it("valid_until 없으면 항상 포함", () => {
    expect(filterValidInsights(rows, "2026-06-22").map((r) => r.id)).toContain("a");
  });
  it("asOf 이후 만료분 포함, 이전 만료분 제외", () => {
    const ids = filterValidInsights(rows, "2026-06-22").map((r) => r.id);
    expect(ids).toContain("b");
    expect(ids).not.toContain("c");
  });
  it("경계: valid_until === asOf 는 포함", () => {
    expect(filterValidInsights([{ id: "x", valid_until: "2026-06-22" }], "2026-06-22")).toHaveLength(1);
  });
});

describe("시스템 프롬프트 주입(appendLearnedInsights)", () => {
  const base = "너는 촉이다.";
  const insights: LearnedInsight[] = [
    { id: "insight:1", category: "topic", rule: "질문형이 강하다", detail: "근거…", confidence: 0.75 },
  ];
  it("비었으면 원본 그대로(해시 불변 보장)", () => {
    expect(appendLearnedInsights(base, [])).toBe(base);
  });
  it("있으면 학습 규칙 섹션 + id + 신뢰도 포함", () => {
    const out = appendLearnedInsights(base, insights);
    expect(out.startsWith(base)).toBe(true);
    expect(out).toContain("승인");
    expect(out).toContain("insight:1");
    expect(out).toContain("75%");
    expect(out).toContain("질문형이 강하다");
  });
  it("confidence null이면 신뢰도 표기 생략", () => {
    const out = appendLearnedInsights(base, [{ id: "insight:2", category: "title", rule: "r", detail: "d", confidence: null }]);
    expect(out).not.toContain("신뢰도");
  });
});
