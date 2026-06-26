// content-lifecycle-actions step0 — 순수 함수만(DB 무관). 날짜 형식 가드(isYmd) 검증.
//   deleteProducedContent/deleteLearningVideo 의 멱등·source 가드는 DB 의존이라 AC 로 검증(여기선 제외).
import { describe, it, expect } from "vitest";
import { isYmd } from "../src/app/actions/contentLifecycle.js";

describe("isYmd — updateContentUploadDate 날짜 형식 가드", () => {
  it("정상 YYYY-MM-DD 통과", () => {
    expect(isYmd("2026-06-26")).toBe(true);
    expect(isYmd("2000-01-01")).toBe(true);
    expect(isYmd("2026-12-31")).toBe(true);
  });

  it("형식 위반 거부(자릿수·구분자)", () => {
    expect(isYmd("2026-6-26")).toBe(false); // 월 1자리
    expect(isYmd("26-06-26")).toBe(false); // 연 2자리
    expect(isYmd("2026/06/26")).toBe(false); // 슬래시 구분
    expect(isYmd("2026-06-26 ")).toBe(false); // trailing space(trim 은 호출자 책임)
    expect(isYmd("")).toBe(false);
    expect(isYmd("not-a-date")).toBe(false);
    expect(isYmd("2026-06-26T00:00:00Z")).toBe(false); // 시각 포함
  });
});
