// scriptFactEligibility 순수함수 단위테스트 — Supa 목 없이.
//   isFactUsableForScript: human_approved !== false (보류 null·승인 true 포함, 명시 반려 false만 배제).
//   isFactPending: escalated_to_human===true && human_approved===null (= '확인 필요'). 그 외 false.
import { describe, it, expect } from "vitest";
import { isFactUsableForScript, isFactPending } from "../src/pipeline/scriptFactEligibility.js";

describe("isFactUsableForScript — 명시 반려만 배제(true/null 허용)", () => {
  it("human_approved=null(에스컬레이션 보류) → 포함(true)", () => {
    expect(isFactUsableForScript({ human_approved: null, escalated_to_human: true })).toBe(true);
  });

  it("human_approved=false(명시 반려) → 배제(false)", () => {
    expect(isFactUsableForScript({ human_approved: false, escalated_to_human: true })).toBe(false);
  });

  it("human_approved=true(사람 승인) → 포함(true)", () => {
    expect(isFactUsableForScript({ human_approved: true, escalated_to_human: true })).toBe(true);
  });

  it("자동통과(비에스컬레이션·null) → 포함(true)", () => {
    expect(isFactUsableForScript({ human_approved: null, escalated_to_human: false })).toBe(true);
  });
});

describe("isFactPending — 에스컬레이션+미확인(null)만 '확인 필요'", () => {
  it("escalated_to_human=true && human_approved=null → true", () => {
    expect(isFactPending({ human_approved: null, escalated_to_human: true })).toBe(true);
  });

  it("자동통과(비에스컬레이션·null) → false", () => {
    expect(isFactPending({ human_approved: null, escalated_to_human: false })).toBe(false);
  });

  it("명시 반려(false) → false(보류 아님)", () => {
    expect(isFactPending({ human_approved: false, escalated_to_human: true })).toBe(false);
  });

  it("사람 승인(true) → false(확인 끝남)", () => {
    expect(isFactPending({ human_approved: true, escalated_to_human: true })).toBe(false);
  });
});
