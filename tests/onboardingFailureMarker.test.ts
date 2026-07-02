// 온보딩 재시도 실패 마커 순수 헬퍼 유닛테스트 (step2).
//   - buildRetryFailureMarker ↔ readRetryFailureMessage 왕복
//   - 아크 모양 payload·null/문자열/undefined는 마커 아님(null)
//   - isRetryMarkerError: OnboardingRetryableError만 true, 일반 Error·영구블록은 false
//   ★ failureMarker.ts는 순수(무거운 import 0) — vitest @/ alias 함정 없이 로드된다.
import { describe, it, expect } from "vitest";
import {
  buildRetryFailureMarker,
  readRetryFailureMessage,
  isRetryMarkerError,
} from "../src/lib/onboarding/failureMarker.js";
import { OnboardingRetryableError } from "../src/agents/onboarder/prepare.js";

const DEFAULT_MSG = "유튜브 검색 한도 초과 — 잠시 후 다시 시도하세요";

describe("failureMarker — build/read 왕복", () => {
  it("마커를 만들면 retryable_failure=true + message가 담긴다", () => {
    const marker = buildRetryFailureMarker("한도 초과");
    expect(marker).toEqual({ retryable_failure: true, message: "한도 초과" });
  });

  it("마커 payload를 읽으면 저장한 메시지를 그대로 반환한다", () => {
    const marker = buildRetryFailureMarker("잠시 후 다시");
    expect(readRetryFailureMessage(marker)).toBe("잠시 후 다시");
  });

  it("message가 빈 문자열이면 기본 안내로 대체한다", () => {
    expect(readRetryFailureMessage({ retryable_failure: true, message: "   " })).toBe(DEFAULT_MSG);
  });

  it("message가 문자열이 아니면 기본 안내로 대체한다", () => {
    expect(readRetryFailureMessage({ retryable_failure: true, message: 42 })).toBe(DEFAULT_MSG);
    expect(readRetryFailureMessage({ retryable_failure: true })).toBe(DEFAULT_MSG);
  });
});

describe("failureMarker — 마커가 아닌 payload는 null(아크 오인 방지)", () => {
  it("아크 모양 payload(questions 등)는 null → 아크로 정상 처리", () => {
    const arcShape = { coreAngle: "돈 관리", questions: [{ prompt: "Q1" }], references: [] };
    expect(readRetryFailureMessage(arcShape)).toBeNull();
  });

  it("retryable_failure가 true가 아니면 null", () => {
    expect(readRetryFailureMessage({ retryable_failure: false, message: "x" })).toBeNull();
    expect(readRetryFailureMessage({ retryable_failure: "true", message: "x" })).toBeNull();
  });

  it("null·undefined·문자열·숫자·배열은 null", () => {
    expect(readRetryFailureMessage(null)).toBeNull();
    expect(readRetryFailureMessage(undefined)).toBeNull();
    expect(readRetryFailureMessage("한도 초과")).toBeNull();
    expect(readRetryFailureMessage(123)).toBeNull();
    expect(readRetryFailureMessage([{ retryable_failure: true, message: "x" }])).toBeNull();
  });
});

describe("isRetryMarkerError — 재시도 에러에만 마커 저장", () => {
  it("OnboardingRetryableError는 true (마커 저장 대상)", () => {
    expect(isRetryMarkerError(new OnboardingRetryableError())).toBe(true);
    expect(isRetryMarkerError(new OnboardingRetryableError("한도 초과"))).toBe(true);
  });

  it("영구 '온보딩 불가'(일반 Error)는 false — 기존 경로(errors.jsonl)로 흘러야 한다", () => {
    expect(isRetryMarkerError(new Error("레퍼런스 영상을 찾지 못해 온보딩 불가"))).toBe(false);
  });

  it("에러 아닌 값·null은 false", () => {
    expect(isRetryMarkerError(null)).toBe(false);
    expect(isRetryMarkerError("OnboardingRetryableError")).toBe(false);
    expect(isRetryMarkerError({ name: "OnboardingRetryableError" })).toBe(false);
  });
});
