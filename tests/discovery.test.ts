// 발굴 신선도(B) 단위 테스트 — 순수 로직만(DB·검색·시각 무관). 통합은 scripts/run-discovery.ts.
import { describe, it, expect } from "vitest";
import { ttlSecondsFor } from "../src/search/search.js";
import { aggregateCommentSignals } from "../src/agents/topic_scout/commentSignals.js";
import { competitorSignalScore, passesQualityFloor, buildCompetitorCandidate } from "../src/agents/topic_scout/discovery.js";
import type { ExternalItem } from "../src/agents/topic_scout/externalSignals.js";

const TTL = {
  defaultTtlSeconds: 86_400,
  volatilityTtlSeconds: { static: 2_592_000, slow: 604_800, fast: 3_600 },
};

describe("검색 캐시 TTL(ttlSecondsFor)", () => {
  it("volatility 미지정 → default TTL", () => {
    expect(ttlSecondsFor({ query: "x" }, TTL)).toBe(86_400);
  });
  it("volatility → 매핑된 TTL (fast<slow<static)", () => {
    expect(ttlSecondsFor({ query: "x", volatility: "fast" }, TTL)).toBe(3_600);
    expect(ttlSecondsFor({ query: "x", volatility: "slow" }, TTL)).toBe(604_800);
    expect(ttlSecondsFor({ query: "x", volatility: "static" }, TTL)).toBe(2_592_000);
    expect(ttlSecondsFor({ query: "x", volatility: "fast" }, TTL)).toBeLessThan(ttlSecondsFor({ query: "x", volatility: "slow" }, TTL));
  });
});

describe("댓글 신호 집계(aggregateCommentSignals)", () => {
  const rows = [
    { body: "파킹통장 금리 어떻게 되나요?", like_count: 0 },
    { body: "파킹통장 추천해주세요 파킹통장 진짜 궁금", like_count: 50 }, // like 가중 + 동일댓글 중복 1회
    { body: "ISA 계좌 어떤가요?", like_count: 0 },
    { body: "그냥 영상 감사합니다 ㅋㅋㅋ", like_count: 0 }, // 전부 불용어 → 신호 0
  ];

  it("질문성 댓글 카운트(? 또는 의문 어미)", () => {
    const { question_comment_count } = aggregateCommentSignals(rows);
    expect(question_comment_count).toBe(2); // "되나요?" + "어떤가요?"
  });

  it("comment_count = 광역(전체 행)", () => {
    expect(aggregateCommentSignals(rows).comment_count).toBe(4);
  });

  it("불용어/조사 제거 + like 가중으로 파킹통장이 상위", () => {
    const { keyword_signals } = aggregateCommentSignals(rows);
    const terms = keyword_signals.map((s) => s.term);
    expect(terms).toContain("파킹통장");
    expect(terms).not.toContain("영상"); // 불용어
    expect(terms).not.toContain("그냥");
    const parking = keyword_signals.find((s) => s.term === "파킹통장")!;
    expect(parking.count).toBeGreaterThanOrEqual(6); // like 50 → 가중 +5, 두 댓글 등장
    expect(parking.id).toBe("kw:파킹통장");
  });

  it("키워드 모드: 해당 키워드 포함 댓글만 + 키워드 자체 제외(동시출현 용어)", () => {
    const { comment_count, keyword_signals } = aggregateCommentSignals(rows, { keyword: "파킹통장" });
    expect(comment_count).toBe(2); // 파킹통장 포함 2건만
    expect(keyword_signals.map((s) => s.term)).not.toContain("파킹통장"); // 키워드 자체 제외
  });
});

describe("경쟁 영상 signal_score(competitorSignalScore) — 배수 가중", () => {
  it("배수 null(구독 비공개) → 기존 log10(views+1) 폴백", () => {
    // 조회 100만 → log10(1000001) ≈ 6 → round2 = 6
    expect(competitorSignalScore(1_000_000, null)).toBe(Math.round(Math.log10(1_000_001) * 100) / 100);
  });

  it("배수 있으면 폴백보다 가중되어 커진다(단조증가)", () => {
    const fallback = competitorSignalScore(1_000_000, null);
    const weighted = competitorSignalScore(1_000_000, 20_000); // 배수 50
    expect(weighted).toBeGreaterThan(fallback);
  });

  it("조회수 같을 때 배수 큰 쪽이 점수 높다(아웃라이어 우선)", () => {
    const lowMult = competitorSignalScore(1_000_000, 1_000_000); // 배수 1
    const highMult = competitorSignalScore(1_000_000, 10_000); // 배수 100
    expect(highMult).toBeGreaterThan(lowMult);
  });

  it("FLOOR_SUBS 미만 채널은 배수 null 취급 → 폴백과 동일", () => {
    // 구독 10명·조회 1만 = 1000배지만 FLOOR_SUBS(1000) 미만 → null 폴백
    expect(competitorSignalScore(10_000, 10)).toBe(competitorSignalScore(10_000, null));
  });

  it("조회수 null → presence 기본점 1", () => {
    expect(competitorSignalScore(null, 5_000)).toBe(1);
  });
});

describe("경쟁 영상 signal_score(competitorSignalScore) — 반응도 가중(B)", () => {
  it("engagement null → 기존 값과 동일(회귀 0)", () => {
    expect(competitorSignalScore(1_000_000, 20_000, null)).toBe(competitorSignalScore(1_000_000, 20_000));
  });

  it("engagement 생략 → null과 동일(기본 인자)", () => {
    expect(competitorSignalScore(1_000_000, 20_000)).toBe(competitorSignalScore(1_000_000, 20_000, null));
  });

  it("배수·반응도 둘 다 null이면 기존 조회수 폴백과 정확히 동일", () => {
    expect(competitorSignalScore(1_000_000, null, null)).toBe(Math.round(Math.log10(1_000_001) * 100) / 100);
  });

  it("반응도 높은 영상이 같은 조회수·배수에서 점수가 더 높다(단조증가)", () => {
    const noEng = competitorSignalScore(1_000_000, 20_000, null);
    const lowEng = competitorSignalScore(1_000_000, 20_000, 0.01);
    const highEng = competitorSignalScore(1_000_000, 20_000, 0.05);
    expect(lowEng).toBeGreaterThan(noEng);
    expect(highEng).toBeGreaterThan(lowEng);
  });

  it("배수 null이어도 반응도는 조회수 폴백에 가중된다", () => {
    const fallback = competitorSignalScore(1_000_000, null, null);
    const withEng = competitorSignalScore(1_000_000, null, 0.03);
    expect(withEng).toBeGreaterThan(fallback);
  });
});

describe("품질 바닥 필터(passesQualityFloor) — D", () => {
  const now = "2026-06-30T00:00:00.000Z";
  const opts = { minViews: 10_000, maxAgeYears: 3, now };

  it("minViews 미만 → false", () => {
    expect(passesQualityFloor(9_999, "2026-01-01T00:00:00Z", opts)).toBe(false);
  });

  it("minViews 경계값(딱 minViews) → 통과", () => {
    expect(passesQualityFloor(10_000, "2026-01-01T00:00:00Z", opts)).toBe(true);
  });

  it("viewCount null → false(데이터 없는 경쟁영상은 컷)", () => {
    expect(passesQualityFloor(null, "2026-01-01T00:00:00Z", opts)).toBe(false);
  });

  it("maxAgeYears 초과(오래된 영상) → false", () => {
    // 5년 전 → 3년 초과
    expect(passesQualityFloor(1_000_000, "2021-01-01T00:00:00Z", opts)).toBe(false);
  });

  it("maxAgeYears 이내(최근) → 통과", () => {
    expect(passesQualityFloor(1_000_000, "2024-06-30T00:00:00Z", opts)).toBe(true);
  });

  it("publishedAt null → 통과(데이터 없음을 벌하지 않음)", () => {
    expect(passesQualityFloor(1_000_000, null, opts)).toBe(true);
  });

  it("now를 Date로 줘도 동작", () => {
    expect(passesQualityFloor(1_000_000, "2024-06-30T00:00:00Z", { minViews: 10_000, maxAgeYears: 3, now: new Date(now) })).toBe(true);
  });
});

describe("후보 빌드 youtube-only 필터(buildCompetitorCandidate) — 옵션 A", () => {
  const nowIso = "2026-06-30T00:00:00.000Z";
  const opts = { minViews: 10_000, maxAgeYears: 3, nowIso };

  const base = (over: Partial<ExternalItem>): ExternalItem => ({
    id: "x:0",
    source: "youtube",
    title: "테스트 영상",
    url: "https://www.youtube.com/watch?v=abc",
    publisher: "어떤채널",
    published_at: "2026-01-01T00:00:00Z",
    snippet: "",
    viewCount: 1_000_000,
    likeCount: 1000,
    commentCount: 100,
    subscriberCount: 20_000,
    thumbnailUrl: null,
    ...over,
  });

  it("web(트렌드 기사) 신호는 null — 주제 후보로 안 만든다", () => {
    const web = base({ source: "web", url: "https://example.com/article", viewCount: null, subscriberCount: null });
    expect(buildCompetitorCandidate(web, opts)).toBeNull();
  });

  it("youtube 경쟁영상은 competitor 후보가 된다", () => {
    const row = buildCompetitorCandidate(base({}), opts);
    expect(row).not.toBeNull();
    expect(row!.source).toBe("competitor");
    expect(row!.dedup_key).toBe("competitor:https://www.youtube.com/watch?v=abc");
    // 'trend' source는 절대 만들지 않는다.
    expect(row!.source).not.toBe("trend");
  });

  it("url 없는 youtube 항목은 null", () => {
    expect(buildCompetitorCandidate(base({ url: "" }), opts)).toBeNull();
  });

  it("품질 바닥 미통과(저조회) youtube 항목은 null", () => {
    expect(buildCompetitorCandidate(base({ viewCount: 9_999 }), opts)).toBeNull();
  });

  it("signal_score는 competitorSignalScore와 일치(재구현 아님)", () => {
    const e = base({});
    const row = buildCompetitorCandidate(e, opts)!;
    // engagement = (1000+100)/1000000, score는 동일 헬퍼로 계산되어야 함.
    expect(row.signal_score).toBe(competitorSignalScore(e.viewCount, e.subscriberCount, (1000 + 100) / 1_000_000));
  });
});
