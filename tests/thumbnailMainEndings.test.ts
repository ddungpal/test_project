// 두 썸네일 메인문구 어미 단조(둘 다 '요' 종결) 검출 — 순수·방어·throw 0.
//   후행 문장부호/틸드/공백 제거 후 마지막 글자가 '요'인지로 판정. 강제 거부 아님(관측용).
import { describe, it, expect } from "vitest";
import { bothMainEndWithYo } from "../src/agents/thumbnail_maker/mainEndings.js";

describe("bothMainEndWithYo — 두 메인문구가 둘 다 '요' 종결인지", () => {
  it("둘 다 '요' 종결 → true", () => {
    expect(bothMainEndWithYo(["지금 사야 해요", "손해 봐요"])).toBe(true);
  });

  it("하나만 '요'(다른 하나 명사 종결) → false", () => {
    expect(bothMainEndWithYo(["지금 사야 해요", "결국 손해"])).toBe(false);
  });

  it("둘 다 '요' 아님(명사 종결) → false", () => {
    expect(bothMainEndWithYo(["통장에 돈 묵히면 손해", "파킹통장이 정답"])).toBe(false);
  });

  it("후행 문장부호 방어(? 제거 후 '요') → true", () => {
    expect(bothMainEndWithYo(["살까요?", "팔까요?"])).toBe(true);
  });

  it("후행 문장부호/틸드/말줄임/공백 섞여도 '요' 판정 → true", () => {
    expect(bothMainEndWithYo(["사세요~", "믿지 마세요…  "])).toBe(true);
  });

  it("2개 미만(빈 배열) → false 방어", () => {
    expect(bothMainEndWithYo([])).toBe(false);
  });

  it("2개 미만(원소 1개) → false 방어", () => {
    expect(bothMainEndWithYo(["지금 사야 해요"])).toBe(false);
  });

  it("빈 문자열 원소 → false 방어", () => {
    expect(bothMainEndWithYo(["", ""])).toBe(false);
  });

  it("3개(길이 2 아님) → false 방어", () => {
    expect(bothMainEndWithYo(["사야 해요", "팔아요", "봐요"])).toBe(false);
  });

  it("배열 아님/원소 문자열 아님 → false 방어", () => {
    // @ts-expect-error 방어 경로 검증
    expect(bothMainEndWithYo(null)).toBe(false);
    // @ts-expect-error 방어 경로 검증
    expect(bothMainEndWithYo(["사야 해요", 42])).toBe(false);
  });

  it("'요'가 문구 끝이 아니라 중간이면 → false", () => {
    expect(bothMainEndWithYo(["요즘 뜨는 종목", "요령 있게 투자"])).toBe(false);
  });
});
