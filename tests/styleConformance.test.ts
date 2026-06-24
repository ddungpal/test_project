// 훅이 스타일 부합도 평가(styleConformance) 단위 테스트 — 순수·결정적(DB·LLM 무관).
//   banned 따옴표 예시구 substring 매칭, emphasis_words winning_score, 깨진/빈 patterns 중립 처리를 검증.
import { describe, it, expect } from "vitest";
import { evaluateStyleConformance, type StyleConformance } from "../src/agents/hook_maker/styleConformance.js";
import type { ThumbnailStylePatterns } from "../src/agents/style_extractor/schema.js";

// 평가 함수는 patterns를 방어적으로 좁혀 읽으므로, 테스트는 관련 필드만 채운 부분 객체를 캐스팅한다.
function patterns(p: { banned?: unknown; emphasis_words?: unknown }): ThumbnailStylePatterns {
  return { copy: { emphasis_words: p.emphasis_words ?? [] }, banned: p.banned ?? [] } as unknown as ThumbnailStylePatterns;
}

const NEUTRAL: StyleConformance = { banned_hits: [], winning_score: 0 };

describe("evaluateStyleConformance", () => {
  it("banned 따옴표 예시구가 text에 있으면 그 항목을 hit", () => {
    const p = patterns({ banned: ['리스트형: "신용카드 TOP4"'] });
    expect(evaluateStyleConformance("신용카드 TOP4 비교", p).banned_hits).toEqual(['리스트형: "신용카드 TOP4"']);
  });

  it("banned 예시구가 text에 없으면 빈 배열", () => {
    const p = patterns({ banned: ['리스트형: "신용카드 TOP4"'] });
    expect(evaluateStyleConformance("연봉 3천 이하 꼭 보세요", p).banned_hits).toEqual([]);
  });

  it("emphasis_words 중 1개 등장 → winning_score 0.5", () => {
    const p = patterns({ emphasis_words: ["딱", "무조건"] });
    expect(evaluateStyleConformance("이건 딱 이거만 보세요", p).winning_score).toBe(0.5);
  });

  it("patterns null → 중립", () => {
    expect(evaluateStyleConformance("아무 텍스트", null)).toEqual(NEUTRAL);
  });

  it("빈 patterns(banned·emphasis 모두 빈 배열) → 중립", () => {
    expect(evaluateStyleConformance("아무 텍스트", patterns({}))).toEqual(NEUTRAL);
  });

  it("자릿수 전체표기: banned 항목·text 둘 다 있으면 hit", () => {
    const p = patterns({ banned: ['과장 금액 "500,000,000원" 표기'] });
    expect(evaluateStyleConformance("월 500,000,000원 버는 법", p).banned_hits).toEqual(['과장 금액 "500,000,000원" 표기']);
  });

  it("자릿수 표기가 banned엔 있으나 text엔 없으면 hit 안 함", () => {
    const p = patterns({ banned: ['금액 "1,000,000원"'] });
    expect(evaluateStyleConformance("적당히 모으는 법", p).banned_hits).toEqual([]);
  });

  it("빈 emphasis_words → winning_score 0, 크래시 없음", () => {
    expect(evaluateStyleConformance("무조건 보세요", patterns({ emphasis_words: [] })).winning_score).toBe(0);
  });

  it("깨진 patterns(banned가 배열 아님) → 중립, 크래시 없음", () => {
    const broken = { copy: 42, banned: "not-an-array" } as unknown as ThumbnailStylePatterns;
    expect(evaluateStyleConformance("텍스트", broken)).toEqual(NEUTRAL);
  });

  it("TOP 토큰: banned 항목·text 둘 다 있으면 hit", () => {
    const p = patterns({ banned: ["랭킹형 TOP 리스트 지양"] });
    expect(evaluateStyleConformance("올해 TOP 펀드 5선", p).banned_hits).toEqual(["랭킹형 TOP 리스트 지양"]);
  });
});
