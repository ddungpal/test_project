// detectFinancial — 재테크 도메인 신호 휴리스틱(순수·결정적). 경계를 고정한다.
//   ★ 자동판정은 '표시·기본값'용일 뿐 — 최종 금융여부는 사용자 토글이 결정한다(step3 UI). 이 테스트는 초기값 제안 경계만 본다.
import { describe, it, expect } from "vitest";
import { detectFinancial } from "../src/pipeline/financialHeuristic.js";

describe("detectFinancial — 금융 신호 경계", () => {
  it("금융 키워드가 있으면 true", () => {
    expect(detectFinancial("연말정산 세금 환급 받는 법")).toBe(true);
    expect(detectFinancial("청약통장 금리 비교")).toBe(true);
    expect(detectFinancial("ETF 배당 수익률")).toBe(true);
    expect(detectFinancial("연금 적금 원금 보장")).toBe(true);
    expect(detectFinancial("주식 투자로 노후 준비")).toBe(true);
  });

  it("% 기호·금액·이율 패턴이 있으면 true", () => {
    expect(detectFinancial("이건 무려 30%나 오른다")).toBe(true);
    expect(detectFinancial("월 100만원씩 모으기")).toBe(true);
    expect(detectFinancial("연 5 짜리 상품")).toBe(true);
    expect(detectFinancial("3.5만 정도 차이남")).toBe(true);
  });

  it("비금융 텍스트는 false", () => {
    expect(detectFinancial("오늘 날씨가 정말 좋네요")).toBe(false);
    expect(detectFinancial("운동 루틴 만드는 법")).toBe(false);
    expect(detectFinancial("요리 레시피 공유")).toBe(false);
    expect(detectFinancial("여행 가서 사진 찍기")).toBe(false);
  });

  it("'프로그램·프로듀스'는 '프로' 패턴에 오탐되지 않는다", () => {
    expect(detectFinancial("이 프로그램은 재밌다")).toBe(false);
    expect(detectFinancial("프로듀스 101")).toBe(false);
  });

  it("빈 문자열·공백은 false", () => {
    expect(detectFinancial("")).toBe(false);
    expect(detectFinancial("   ")).toBe(false);
  });

  it("결정적: 같은 입력 → 같은 출력", () => {
    const s = "연 4.5% 적금 추천";
    expect(detectFinancial(s)).toBe(detectFinancial(s));
    expect(detectFinancial(s)).toBe(true);
  });
});
