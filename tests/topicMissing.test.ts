// detectTopicMissing 단위 테스트 — 순수·결정적. 오탐(없는데 경고) 최소화 동작을 못박는다.
//   강제 거부 아님(표시 전용). 키워드 추출이 애매하면 경고 안 함(missing:false).
import { describe, it, expect } from "vitest";
import { detectTopicMissing } from "../src/agents/thumbnail_maker/topicMissing.js";

describe("detectTopicMissing — 주제 키워드 누락 소프트 판정", () => {
  it("메인문구에 주제 키워드가 그대로 있으면 missing:false", () => {
    const r = detectTopicMissing(["레버리지 ETF 진짜 위험할까", "초보는 사지 마세요"], "레버리지 ETF", "레버리지 ETF 사도 될까");
    expect(r.missing).toBe(false);
  });

  it("영문 약어(ETF)가 메인문구에 들어가면 missing:false (대소문자 무관)", () => {
    const r = detectTopicMissing(["etf 투자 이렇게", "수익률 공개"], "ETF 투자", "ETF로 돈 버는 법");
    expect(r.missing).toBe(false);
  });

  it("주제 키워드가 메인문구에 명백히 없으면 missing:true + keyword 반환", () => {
    const r = detectTopicMissing(["이거 모르면 손해", "지금 당장 확인"], "레버리지 ETF", "레버리지 ETF 사도 될까");
    expect(r.missing).toBe(true);
    expect(typeof r.keyword).toBe("string");
    expect(r.keyword && r.keyword.length).toBeGreaterThan(0);
  });

  it("공백·대소문자가 달라도 부분일치로 인정(정규화) — missing:false", () => {
    const r = detectTopicMissing(["레버리지   ETF로 망한다"], "레버리지 ETF", "레버리지 ETF");
    expect(r.missing).toBe(false);
  });

  it("키워드 일부만 들어가도(하나라도 일치) missing:false — 과탐 회피", () => {
    const r = detectTopicMissing(["적금 깨고 투자한 후기"], "적금 깨고 주식 시작", "적금 vs 주식");
    expect(r.missing).toBe(false);
  });

  it("topic/selectedTitle이 모두 비면 추출 불가 → missing:false, keyword:null", () => {
    const r = detectTopicMissing(["아무 문구나", "또 다른 문구"], "", "");
    expect(r).toEqual({ missing: false, keyword: null });
  });

  it("주제가 불용어/1글자뿐이라 키워드 추출 불가하면 경고 안 함(오탐 회피)", () => {
    const r = detectTopicMissing(["전혀 다른 내용"], "그냥 이거 정말", "그냥");
    // 추출된 핵심 키워드가 없으면 missing:false(애매하면 경고 안 함).
    expect(r.missing).toBe(false);
  });

  it("mains가 빈 배열이면 비교 대상 없음 → 중립(missing:false)", () => {
    const r = detectTopicMissing([], "레버리지 ETF", "레버리지 ETF");
    expect(r).toEqual({ missing: false, keyword: null });
  });

  it("입력이 깨져도(비배열·비문자열) 크래시 없이 중립 반환", () => {
    expect(detectTopicMissing(undefined as unknown as string[], "x", "y")).toEqual({ missing: false, keyword: null });
    expect(detectTopicMissing([null as unknown as string, 3 as unknown as string], "레버리지 ETF", "레버리지 ETF").missing).toBe(false);
    expect(detectTopicMissing(["문구"], undefined as unknown as string, undefined as unknown as string)).toEqual({ missing: false, keyword: null });
  });

  it("조사가 붙은 주제어도 메인문구에 핵심 명사가 있으면 missing:false", () => {
    const r = detectTopicMissing(["비상금 모으는 법"], "비상금이", "비상금 모으기");
    expect(r.missing).toBe(false);
  });
});
