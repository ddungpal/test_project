// A/B 스타일 재학습 sweep(운영 자동화 ②) 단위 테스트 — 순수 적격 판정만(DB·LLM 무관).
//   라이브 sweep(styleRelearnSweep)은 표본수 비교 후 draft 생성(멱등). 여기선 그 멱등의 핵심인 순수 판정을 검증.
import { describe, it, expect } from "vitest";
import { eligibleForStyleRelearn } from "../src/performance/styleRelearn.js";

describe("eligibleForStyleRelearn (순수 적격 판정)", () => {
  it("표본 증가 없으면(5→5) 재학습 안 함(멱등)", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 5, lastLearnedSampleCount: 5 })).toBe(false);
  });

  it("표본이 minDelta(기본 1) 이상 늘면(5→8) 재학습 적격", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 8, lastLearnedSampleCount: 5 })).toBe(true);
  });

  it("표본 감소(8→6)는 재학습 안 함(무의미 재학습 차단)", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 6, lastLearnedSampleCount: 8 })).toBe(false);
  });

  it("정확히 1 증가(5→6)도 기본 minDelta=1 이면 적격(경계)", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 6, lastLearnedSampleCount: 5 })).toBe(true);
  });

  it("minDelta=3: 2 증가(5→7)는 아직 보류, 3 증가(5→8)부터 적격(소표본 흔들림 방지)", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 7, lastLearnedSampleCount: 5, minDelta: 3 })).toBe(false);
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 8, lastLearnedSampleCount: 5, minDelta: 3 })).toBe(true);
  });

  it("아직 학습 이력 없고 표본이 있으면(0→N) 첫 학습 적격", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 9, lastLearnedSampleCount: 0 })).toBe(true);
  });

  it("표본 0이면 첫 학습도 보류(빈 입력 — LLM 호출 무의미)", () => {
    expect(eligibleForStyleRelearn({ currentAbSampleCount: 0, lastLearnedSampleCount: 0 })).toBe(false);
  });
});
