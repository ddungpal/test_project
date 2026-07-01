// 쏙이 온보딩 섹션 노출 창 순수 술어 테스트 — thumbnails_selected~published 구간 판정.
import { describe, it, expect } from "vitest";
import { isOnboardingVisible, type RunState } from "../src/domain/enums.js";

describe("isOnboardingVisible", () => {
  it("thumbnails_selected~published 구간은 true", () => {
    const visible: RunState[] = [
      "thumbnails_selected",
      "structure_proposed",
      "structure_selected",
      "research_review",
      "scripting",
      "script_review",
      "approved",
      "published",
    ];
    for (const s of visible) {
      expect(isOnboardingVisible(s), s).toBe(true);
    }
  });

  it("구간 밖(이전 상태·트레일링 비파이프라인 상태)은 false", () => {
    const hidden: RunState[] = [
      "created",
      "topic_proposed",
      "titles_selected",
      "thumbnails_proposed",
      "aborted",
      "paused_soft_cap",
    ];
    for (const s of hidden) {
      expect(isOnboardingVisible(s), s).toBe(false);
    }
  });

  it("경계값: thumbnails_proposed=false(경계 바로 아래)", () => {
    expect(isOnboardingVisible("thumbnails_proposed")).toBe(false);
  });

  it("경계값: thumbnails_selected=true(하단 경계)", () => {
    expect(isOnboardingVisible("thumbnails_selected")).toBe(true);
  });

  it("경계값: published=true(상단 경계)", () => {
    expect(isOnboardingVisible("published")).toBe(true);
  });
});
