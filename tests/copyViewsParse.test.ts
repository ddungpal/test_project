// copy-views-weight step2 — 폼 24h 조회수 입력 파싱(순수 함수) 단위 테스트.
//   빈칸·비수치·음수는 null(무가중·하위호환), "0"은 0으로 구분.
import { describe, it, expect } from "vitest";
import { parseViews24h } from "../src/components/copyViewsParse.js";

describe("parseViews24h", () => {
  it("정수 문자열을 숫자로 파싱", () => {
    expect(parseViews24h("52000")).toBe(52000);
  });

  it("'0'은 0으로 유지(빈칸과 구분)", () => {
    expect(parseViews24h("0")).toBe(0);
  });

  it("빈칸/공백은 null", () => {
    expect(parseViews24h("")).toBeNull();
    expect(parseViews24h("   ")).toBeNull();
  });

  it("음수는 null(조회수 음수 무의미)", () => {
    expect(parseViews24h("-100")).toBeNull();
  });

  it("비수치는 null", () => {
    expect(parseViews24h("abc")).toBeNull();
    expect(parseViews24h("12k")).toBeNull();
  });

  it("앞뒤 공백은 트림 후 파싱", () => {
    expect(parseViews24h("  52000  ")).toBe(52000);
  });
});
