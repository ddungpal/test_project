// 인사이트 승인(Phase 4 슬라이스 3) 단위 테스트 — 순수 전이 가드.
import { describe, it, expect } from "vitest";
import { canTransitionInsightStatus, nextInsightStatuses, INSIGHT_STATUS_LABEL, INSIGHT_CATEGORY_LABEL } from "../src/domain/insightStatus.js";
import { INSIGHT_CATEGORIES } from "../src/agents/retrospectivist/schema.js";

describe("인사이트 상태 전이(canTransitionInsightStatus)", () => {
  it("draft → reviewed/approved/deprecated 허용", () => {
    expect(canTransitionInsightStatus("draft", "approved")).toBe(true);
    expect(canTransitionInsightStatus("draft", "reviewed")).toBe(true);
    expect(canTransitionInsightStatus("draft", "deprecated")).toBe(true);
  });
  it("같은 상태로는 전이 불가", () => {
    expect(canTransitionInsightStatus("draft", "draft")).toBe(false);
    expect(canTransitionInsightStatus("approved", "approved")).toBe(false);
  });
  it("승인 되돌리기(approved→reviewed/deprecated) 허용, approved→draft 불가", () => {
    expect(canTransitionInsightStatus("approved", "reviewed")).toBe(true);
    expect(canTransitionInsightStatus("approved", "deprecated")).toBe(true);
    expect(canTransitionInsightStatus("approved", "draft")).toBe(false);
  });
  it("폐기→초안만 허용(되살리기)", () => {
    expect(nextInsightStatuses("deprecated")).toEqual(["draft"]);
  });
});

describe("라벨 완전성", () => {
  it("8개 카테고리 전부 한국어 라벨 보유", () => {
    for (const c of INSIGHT_CATEGORIES) expect(INSIGHT_CATEGORY_LABEL[c]).toBeTruthy();
  });
  it("4개 상태 전부 라벨 보유", () => {
    (["draft", "reviewed", "approved", "deprecated"] as const).forEach((s) => expect(INSIGHT_STATUS_LABEL[s]).toBeTruthy());
  });
});
