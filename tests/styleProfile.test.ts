// 썸네일 스타일 환류(PhaseA Step1) 순수 함수 테스트 — DB·LLM 무관.
//   핵심: appendThumbnailStyle이 프로필 없을 때 시스템 프롬프트를 바이트 단위로 보존한다(픽스처 해시 보존).
import { describe, it, expect } from "vitest";
import { appendThumbnailStyle, type ActiveThumbnailStyle } from "../src/agents/shared/styleProfile.js";

const BASE = "너는 훅이다.\n제목·썸네일을 제안한다.";

const PROFILE: ActiveThumbnailStyle = {
  id: "style:abc-123",
  version: 2,
  patterns: {
    copy: { hook_patterns: ["연봉 N 이하 꼭 보세요"], length_notes: "짧게" },
    visual: { face: "정면 클로즈업" },
    banned: ["사색적 톤"],
  },
};

describe("appendThumbnailStyle (순수)", () => {
  it("프로필이 있으면 스타일 섹션과 id·patterns를 시스템에 덧붙인다", () => {
    const out = appendThumbnailStyle(BASE, PROFILE);
    expect(out).not.toBe(BASE);
    expect(out.startsWith(BASE)).toBe(true); // 베이스는 앞에 그대로 보존
    expect(out).toContain("김짠부 썸네일 스타일 사양");
    expect(out).toContain("style:abc-123"); // evidence 링크용 id 노출
    expect(out).toContain("연봉 N 이하 꼭 보세요"); // patterns 내용 포함
    expect(out).toContain("사색적 톤");
  });

  it("프로필이 null이면 시스템을 바이트 단위로 보존한다(해시 불변)", () => {
    const out = appendThumbnailStyle(BASE, null);
    expect(out).toBe(BASE);
  });

  it("patterns가 빈 객체면 보존한다", () => {
    const out = appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: {} });
    expect(out).toBe(BASE);
  });

  it("patterns가 null/비-객체/배열이면 보존한다(깨진 patterns 가드)", () => {
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: null })).toBe(BASE);
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: "깨짐" })).toBe(BASE);
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: ["a", "b"] })).toBe(BASE);
  });
});
