// videoWeight 순수함수 단위테스트(comment-interest-weighting step0).
//   popularityWeight = log_base(views + base) — 조회수 로그 압축. null/비유한/≤0 → 1.0.
//   recencyWeight = FLOOR + (1-FLOOR)/(1 + ageMonths/HALFLIFE) — 방금 1.0, 반감기 ~0.65, 오래→FLOOR.
//   videoWeight = 두 축의 곱. buildVideoWeightMap = videoId→weight(DB 접근 0).
//   now는 전부 인자 주입 — Date.now()/argless new Date() 없음(결정적).

import { describe, expect, it } from "vitest";
import {
  RECENCY_FLOOR,
  HALFLIFE_MONTHS,
  popularityWeight,
  recencyWeight,
  videoWeight,
  buildVideoWeightMap,
} from "../src/agents/topic_scout/videoWeight.js";

// 고정 now — 모든 시간 테스트의 기준(결정적). uploadDate를 여기서 뒤로 밀어 age 계산.
const NOW = "2026-07-14T00:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();
const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// n개월 전 업로드 ISO 생성 헬퍼(recencyWeight의 개월 환산과 동일 상수).
const monthsAgo = (m: number) => new Date(NOW_MS - m * DAYS_PER_MONTH * MS_PER_DAY).toISOString();

describe("popularityWeight", () => {
  it("1천 vs 100만 — 대략 2배 비율(로그 압축이라 폭주 안 함)", () => {
    const w1k = popularityWeight(1_000);
    const w1m = popularityWeight(1_000_000);
    expect(w1k).toBeCloseTo(3, 0); // log10(1000+10) ≈ 3
    expect(w1m).toBeCloseTo(6, 0); // log10(1000000+10) ≈ 6
    // 조회수는 1000배 차이지만 가중은 대략 2배(6/3) — 대박이 점수를 폭발시키지 않는다.
    expect(w1m / w1k).toBeGreaterThan(1.8);
    expect(w1m / w1k).toBeLessThan(2.2);
  });

  it("null/undefined/비유한/≤0 → 1.0 폴백", () => {
    expect(popularityWeight(null)).toBe(1.0);
    expect(popularityWeight(undefined)).toBe(1.0);
    expect(popularityWeight(0)).toBe(1.0);
    expect(popularityWeight(-500)).toBe(1.0);
    expect(popularityWeight(NaN)).toBe(1.0);
    expect(popularityWeight(Infinity)).toBe(1.0);
  });

  it("조회수 단조 증가 — 많이 볼수록 가중 큼", () => {
    expect(popularityWeight(100_000)).toBeGreaterThan(popularityWeight(1_000));
  });
});

describe("recencyWeight", () => {
  it("방금(age 0) ≈ 1.0", () => {
    expect(recencyWeight(NOW, NOW)).toBeCloseTo(1.0, 5);
  });

  it("반감기(HALFLIFE_MONTHS 도달) ≈ 0.65", () => {
    // FLOOR + (1-FLOOR)/(1 + 1) = 0.3 + 0.35 = 0.65
    expect(recencyWeight(monthsAgo(HALFLIFE_MONTHS), NOW)).toBeCloseTo(0.65, 4);
  });

  it("아주 오래된 영상 → FLOOR 근처로 수렴", () => {
    const w = recencyWeight(monthsAgo(600), NOW); // 50년 전
    expect(w).toBeGreaterThan(RECENCY_FLOOR);
    expect(w).toBeLessThan(RECENCY_FLOOR + 0.01);
  });

  it("uploadDate null/undefined/파싱불가 → 1.0(데이터 없음 벌하지 않음)", () => {
    expect(recencyWeight(null, NOW)).toBe(1.0);
    expect(recencyWeight(undefined, NOW)).toBe(1.0);
    expect(recencyWeight("not-a-date", NOW)).toBe(1.0);
  });

  it("미래 날짜(ageMonths<0) → 0 clamp → 1.0", () => {
    const future = new Date(NOW_MS + 60 * DAYS_PER_MONTH * MS_PER_DAY).toISOString();
    expect(recencyWeight(future, NOW)).toBeCloseTo(1.0, 5);
  });

  it("now가 Date 객체여도 동일", () => {
    expect(recencyWeight(monthsAgo(HALFLIFE_MONTHS), new Date(NOW))).toBeCloseTo(0.65, 4);
  });

  it("now 파싱 실패 → 1.0 폴백(프리미엄 유지)", () => {
    expect(recencyWeight(monthsAgo(HALFLIFE_MONTHS), "garbage")).toBe(1.0);
  });

  it("최신성 단조 감소 — 오래될수록 작아짐", () => {
    expect(recencyWeight(monthsAgo(1), NOW)).toBeGreaterThan(recencyWeight(monthsAgo(6), NOW));
  });
});

describe("videoWeight", () => {
  it("popularityWeight × recencyWeight 곱과 정확히 일치", () => {
    const views = 50_000;
    const up = monthsAgo(3);
    expect(videoWeight(views, up, NOW)).toBeCloseTo(
      popularityWeight(views) * recencyWeight(up, NOW),
      10,
    );
  });

  it("데이터 전무(views·uploadDate null) → 1.0 × 1.0 = 1.0", () => {
    expect(videoWeight(null, null, NOW)).toBe(1.0);
  });

  it("신선한 망작(저조회·최신) vs 오래된 대박(고조회·약간 구식) — 근소하게 갈린다", () => {
    // 신선한 망작: 조회 2천, 방금 업로드 → 인기 낮지만 최신 프리미엄 만점(pop≈3.3 × 1.0).
    const freshFlop = videoWeight(2_000, NOW, NOW);
    // 오래된 대박: 조회 200만, 3개월 전 → 인기 높지만 최신성 감쇠(pop≈6.3 × recency≈0.58).
    const oldHit = videoWeight(2_000_000, monthsAgo(3), NOW);
    // 둘 다 유의미한 가중을 갖되(어느 쪽도 0 아님), 대박이 살짝 앞선다(근소) — 최신성이 조회 이득을 상당히 상쇄.
    expect(freshFlop).toBeGreaterThan(0);
    expect(oldHit).toBeGreaterThan(0);
    expect(oldHit).toBeGreaterThan(freshFlop); // 고조회의 로그 이득이 최신성 감쇠를 근소하게 이김.
    expect(oldHit / freshFlop).toBeLessThan(1.3); // 근소 — 최신성 가중이 대박을 크게 상쇄.
  });
});

describe("buildVideoWeightMap", () => {
  it("여러 영상 → videoId별 가중 맵(각 값은 videoWeight와 일치)", () => {
    const videos = [
      { youtubeVideoId: "aaa", views: 100_000, uploadDate: NOW },
      { youtubeVideoId: "bbb", views: 5_000, uploadDate: monthsAgo(12) },
    ];
    const map = buildVideoWeightMap(videos, NOW);
    expect(map.size).toBe(2);
    expect(map.get("aaa")).toBeCloseTo(videoWeight(100_000, NOW, NOW), 10);
    expect(map.get("bbb")).toBeCloseTo(videoWeight(5_000, monthsAgo(12), NOW), 10);
  });

  it("중복 videoId → 마지막 값으로 덮어씀", () => {
    const videos = [
      { youtubeVideoId: "dup", views: 1_000, uploadDate: NOW },
      { youtubeVideoId: "dup", views: 1_000_000, uploadDate: NOW },
    ];
    const map = buildVideoWeightMap(videos, NOW);
    expect(map.size).toBe(1);
    expect(map.get("dup")).toBeCloseTo(videoWeight(1_000_000, NOW, NOW), 10); // 마지막(고조회) 값.
  });

  it("데이터 없는 영상(views·uploadDate null)도 키 존재(1.0 폴백)", () => {
    const videos = [{ youtubeVideoId: "empty", views: null, uploadDate: null }];
    const map = buildVideoWeightMap(videos, NOW);
    expect(map.has("empty")).toBe(true);
    expect(map.get("empty")).toBe(1.0);
  });

  it("빈 배열 → 빈 맵", () => {
    expect(buildVideoWeightMap([], NOW).size).toBe(0);
  });
});
