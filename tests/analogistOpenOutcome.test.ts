// 회귀 가드: 유이 ANALOGIST_SYSTEM에 '결과가 열린 케이스로' 규칙이 남아있는지.
//   비유가 오를수도·횡보할수도·떨어질수도 있는 여러 가능성을 담게 하는 지시가
//   프롬프트 회귀로 빠지면 잡는다.
import { describe, it, expect } from "vitest";
import { ANALOGIST_SYSTEM } from "../src/agents/analogist/schema.js";

describe("analogist ANALOGIST_SYSTEM: 결과가 열린 케이스", () => {
  it("결과가 열린 케이스 규칙을 포함한다", () => {
    expect(ANALOGIST_SYSTEM).toContain("결과가 열린");
  });
  it("횡보 가능성을 언급한다", () => {
    expect(ANALOGIST_SYSTEM).toContain("횡보");
  });
});
