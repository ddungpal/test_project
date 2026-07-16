// ctr-input-screen step2 — CTR 수동입력 파싱·표시 순수 함수 단위 테스트.
//   parseCtrInput: 0<ctr≤100 범위 검증(경계 100·0.01 통과, 0/음수/100.1 거부), 빈값·비숫자 거부. formatCtr: null→"—".
import { describe, it, expect } from "vitest";
import { parseCtrInput, formatCtr } from "../src/lib/performance/ctrInput.js";

describe("parseCtrInput", () => {
  it("정상 값을 number 로 파싱", () => {
    const r = parseCtrInput("3.8");
    expect(r).toEqual({ ok: true, ctr: 3.8 });
  });

  it("앞뒤 공백을 무시하고 파싱", () => {
    const r = parseCtrInput("  6.4  ");
    expect(r).toEqual({ ok: true, ctr: 6.4 });
  });

  it("경계: 100 은 통과", () => {
    expect(parseCtrInput("100")).toEqual({ ok: true, ctr: 100 });
  });

  it("경계: 0.01 은 통과", () => {
    expect(parseCtrInput("0.01")).toEqual({ ok: true, ctr: 0.01 });
  });

  it("0 은 거부(0 초과여야 함)", () => {
    const r = parseCtrInput("0");
    expect(r.ok).toBe(false);
  });

  it("음수는 거부", () => {
    const r = parseCtrInput("-1");
    expect(r.ok).toBe(false);
  });

  it("100 초과(100.1)는 거부", () => {
    const r = parseCtrInput("100.1");
    expect(r.ok).toBe(false);
  });

  it("150 은 거부", () => {
    const r = parseCtrInput("150");
    expect(r.ok).toBe(false);
  });

  it("빈 문자열은 거부", () => {
    const r = parseCtrInput("");
    expect(r.ok).toBe(false);
  });

  it("공백만 있으면 거부", () => {
    const r = parseCtrInput("   ");
    expect(r.ok).toBe(false);
  });

  it("비숫자는 거부", () => {
    const r = parseCtrInput("abc");
    expect(r.ok).toBe(false);
  });

  it("에러 메시지는 한글", () => {
    const r = parseCtrInput("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/[가-힣]/);
  });
});

describe("formatCtr", () => {
  it("null 은 '—'", () => {
    expect(formatCtr(null)).toBe("—");
  });

  it("값은 '%' 접미", () => {
    expect(formatCtr(3.8)).toBe("3.8%");
  });

  it("정수도 '%' 접미", () => {
    expect(formatCtr(6)).toBe("6%");
  });
});
