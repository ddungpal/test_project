// detectTitleSignatureMissing 단위 테스트 — 순수·결정적. 오탐(없는데 경고) 최소화 동작을 못박는다.
//   강제 거부 아님(표시 전용). 시그니처 후보를 못 모으면 경고 안 함(missing:false).
import { describe, it, expect } from "vitest";
import { detectTitleSignatureMissing } from "../src/agents/hook_maker/titleSignature.js";

describe("detectTitleSignatureMissing — 김짠부 시그니처 누락 소프트 판정", () => {
  it("signature_words 중 하나가 제목에 있으면 missing:false", () => {
    const patterns = { signature_words: ["이만큼만", "사두세요"] };
    const r = detectTitleSignatureMissing("이만큼만 사두세요 비상금", patterns);
    expect(r.missing).toBe(false);
  });

  it("skeleton 고정어구(template 리터럴)가 제목에 있으면 missing:false", () => {
    const patterns = { skeletons: { title: [{ template: "이만큼만 사두세요 {topic}", slots: ["topic"] }] } };
    const r = detectTitleSignatureMissing("이만큼만 사두세요 ETF", patterns);
    expect(r.missing).toBe(false);
  });

  it("시그니처를 하나도 안 쓰면 missing:true", () => {
    const patterns = { signature_words: ["이만큼만", "사두세요"], skeletons: { title: [{ template: "꼭 보세요 {topic}", slots: ["topic"] }] } };
    const r = detectTitleSignatureMissing("일반적인 재테크 영상 제목입니다", patterns);
    expect(r.missing).toBe(true);
  });

  it("patterns가 undefined면 시그니처 후보 없음 → missing:false(중립)", () => {
    const r = detectTitleSignatureMissing("아무 제목", undefined);
    expect(r).toEqual({ missing: false });
  });

  it("patterns가 null이면 missing:false(중립)", () => {
    const r = detectTitleSignatureMissing("아무 제목", null);
    expect(r).toEqual({ missing: false });
  });

  it("patterns가 빈 객체({})면 시그니처 후보 없음 → missing:false(오탐 회피)", () => {
    const r = detectTitleSignatureMissing("아무 제목", {});
    expect(r).toEqual({ missing: false });
  });

  it("signature_words·skeletons 둘 다 비면 후보 0개 → missing:false(중립)", () => {
    const patterns = { signature_words: [], skeletons: { title: [] } };
    const r = detectTitleSignatureMissing("아무 제목", patterns);
    expect(r).toEqual({ missing: false });
  });

  it("공백·대소문자가 달라도 부분일치로 인정(정규화) — missing:false", () => {
    const patterns = { signature_words: ["이만큼만 사두세요"] };
    const r = detectTitleSignatureMissing("이만큼만   사두세요", patterns);
    expect(r.missing).toBe(false);
  });

  it("영문 시그니처 대소문자 무관 부분일치 — missing:false", () => {
    const patterns = { signature_words: ["ETF"] };
    const r = detectTitleSignatureMissing("초보도 etf로 시작하기", patterns);
    expect(r.missing).toBe(false);
  });

  it("title이 빈 문자열이면 비교 대상 없음 → 중립(missing:false)", () => {
    const patterns = { signature_words: ["이만큼만"] };
    const r = detectTitleSignatureMissing("", patterns);
    expect(r).toEqual({ missing: false });
  });

  it("입력이 깨져도(비문자열 title, 비배열 signature_words) 크래시 없이 missing:false", () => {
    expect(detectTitleSignatureMissing(undefined as unknown as string, { signature_words: ["이만큼만"] })).toEqual({ missing: false });
    expect(detectTitleSignatureMissing(3 as unknown as string, { signature_words: ["이만큼만"] })).toEqual({ missing: false });
    // 비배열 signature_words → 후보 0개 → 중립.
    expect(detectTitleSignatureMissing("이만큼만 사두세요", { signature_words: "이만큼만" })).toEqual({ missing: false });
    // signature_words 안에 비문자열이 섞여도 크래시 없이 string만 후보로.
    expect(detectTitleSignatureMissing("이만큼만 사두세요", { signature_words: [null, 3, "이만큼만"] }).missing).toBe(false);
    // skeletons.title 항목이 깨져도(템플릿 비문자열·null) 크래시 없음.
    expect(detectTitleSignatureMissing("아무 제목", { skeletons: { title: [null, { template: 5 }] } })).toEqual({ missing: false });
    // patterns 자체가 비객체(문자열·숫자)여도 중립.
    expect(detectTitleSignatureMissing("아무 제목", "이만큼만")).toEqual({ missing: false });
    expect(detectTitleSignatureMissing("아무 제목", 42)).toEqual({ missing: false });
  });

  it("슬롯만 있는 template은 리터럴 토큰이 없어 후보 0개 → missing:false(오탐 회피)", () => {
    const patterns = { skeletons: { title: [{ template: "{topic}", slots: ["topic"] }] } };
    const r = detectTitleSignatureMissing("아무 제목", patterns);
    expect(r).toEqual({ missing: false });
  });
});
