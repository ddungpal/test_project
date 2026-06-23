// 회고 자동 sweep(운영 자동화 ①) 단위 테스트 — 순수 선별 로직. 라이브는 scripts/run-retro-sweep.ts.
import { describe, it, expect } from "vitest";
import { eligibleForRetrospective } from "../src/agents/retrospectivist/runRetrospective.js";

describe("회고 대상 선별(eligibleForRetrospective)", () => {
  it("성과 있고 회고 없는 콘텐츠만", () => {
    const r = eligibleForRetrospective(["a", "b", "c"], ["b"], 10);
    expect(r).toEqual(["a", "c"]);
  });
  it("멱등: 전부 회고 완료면 대상 0", () => {
    expect(eligibleForRetrospective(["a", "b"], ["a", "b"], 10)).toEqual([]);
  });
  it("limit으로 1회 처리 상한", () => {
    expect(eligibleForRetrospective(["a", "b", "c", "d"], [], 2)).toEqual(["a", "b"]);
  });
  it("성과 목록 중복 제거 + 입력 순서 유지", () => {
    expect(eligibleForRetrospective(["a", "a", "b"], [], 10)).toEqual(["a", "b"]);
  });
  it("성과 없으면 대상 0", () => {
    expect(eligibleForRetrospective([], ["a"], 10)).toEqual([]);
  });
});
