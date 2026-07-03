// refYouTubeQuery — 참조 검색용 쿼리 정제(제목에서 핵심 키워드만). 순수·throw 0.
//   1) 대괄호[..]·소괄호(..) 세그먼트 제거. 2) 첫 구분자(',' '|' 개행) 앞 절만 유지.
//   3) 앞뒤 따옴표·후행 문장부호(?!.…~)·잉여 공백 정리. 4) 결과 2자 미만이면 원 제목(trim) 폴백.
import { describe, it, expect } from "vitest";
import { refYouTubeQuery } from "../src/agents/onboarder/prepare.js";

describe("refYouTubeQuery — 검색 쿼리 정제", () => {
  it("spec 예시: 대괄호 제거 + 첫 콤마 앞 + 후행 물음표 정리", () => {
    expect(refYouTubeQuery("커버드콜 ETF, 배당 진짜 나올까? [EP.65]")).toBe("커버드콜 ETF");
  });

  it("대괄호 세그먼트 제거([EP.65]·[3부])", () => {
    expect(refYouTubeQuery("파킹통장 TOP5 [3부]")).toBe("파킹통장 TOP5");
  });

  it("소괄호 세그먼트 제거((사연편))", () => {
    expect(refYouTubeQuery("적금 이자 함정 (사연편)")).toBe("적금 이자 함정");
  });

  it("첫 콤마 앞 절만 유지", () => {
    expect(refYouTubeQuery("배당주 고르는 법, 이것만 보세요, 초보용")).toBe("배당주 고르는 법");
  });

  it("파이프(|) 구분자 앞 절만 유지", () => {
    expect(refYouTubeQuery("연금저축 완벽정리 | 세액공제 총정리")).toBe("연금저축 완벽정리");
  });

  it("개행 앞 절만 유지", () => {
    expect(refYouTubeQuery("월배당 ETF 추천\n숨은 함정까지")).toBe("월배당 ETF 추천");
  });

  it("앞뒤 따옴표 제거", () => {
    expect(refYouTubeQuery('"통장 쪼개기" 완벽 가이드')).toBe("통장 쪼개기 완벽 가이드");
  });

  it("후행 문장부호(?!.…~) 제거", () => {
    expect(refYouTubeQuery("이게 진짜 되나...")).toBe("이게 진짜 되나");
    expect(refYouTubeQuery("대박 재테크!!!")).toBe("대박 재테크");
    expect(refYouTubeQuery("정말요~~")).toBe("정말요");
  });

  it("잉여 공백 정리(중간 다중 공백 → 단일)", () => {
    expect(refYouTubeQuery("연금   저축   정리")).toBe("연금 저축 정리");
  });

  it("결과가 2자 미만이면 원 제목(trim) 폴백", () => {
    // 대괄호·구분자 제거 후 남는 게 1자뿐이면 원 제목을 그대로 쓴다.
    expect(refYouTubeQuery("A [긴 부제목 세그먼트]")).toBe("A [긴 부제목 세그먼트]");
  });

  it("빈 문자열/공백만 → trim한 원본 폴백", () => {
    expect(refYouTubeQuery("")).toBe("");
    expect(refYouTubeQuery("   ")).toBe("");
  });

  it("정제할 게 없는 깔끔한 제목은 그대로", () => {
    expect(refYouTubeQuery("배당 ETF 완벽 정리")).toBe("배당 ETF 완벽 정리");
  });

  // ── 4토큰 캡 · 물음표 경계 (근본 픽스 회귀) ────────────────────────────
  it("긴 콤마 없는 제목 → 4토큰 이하로 축약(핵심어 보존·0개 반환 방지)", () => {
    // 라이브 근본원인: 12단어 초정밀 쿼리라 YouTube가 0개 반환. 앞 4토큰으로 잘라 검색 가능하게.
    const out = refYouTubeQuery("커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복");
    const tokens = out.split(" ").filter(Boolean);
    expect(tokens.length).toBeLessThanOrEqual(4); // ★ 4토큰 이하
    expect(out).toContain("커버드콜"); // 핵심어 보존
    // 물음표 경계로 뒷절("초보를 위한 원리 완전 정복")은 이미 잘려 나감.
    expect(out).not.toContain("초보");
  });

  it("콤마 제목 → 첫 절만(4토큰 캡 무해)", () => {
    expect(refYouTubeQuery("월배당 ETF, 매달 현금 꽂히는 종목")).toBe("월배당 ETF");
  });

  it("물음표를 절 경계로 컷(뒷절 제거)", () => {
    expect(refYouTubeQuery("배당 진짜 나올까? 지금 사도 될까")).toBe("배당 진짜 나올까");
  });

  it("느낌표를 절 경계로 컷(뒷절 제거)", () => {
    expect(refYouTubeQuery("이거 놓치면 손해! 지금 확인하세요")).toBe("이거 놓치면 손해");
  });

  it("긴 첫 절이어도 앞 4토큰만(대괄호/괄호 제거 후 적용)", () => {
    expect(refYouTubeQuery("연금저축 세액공제 완벽 총정리 최신판 [2026]")).toBe("연금저축 세액공제 완벽 총정리");
  });
});
