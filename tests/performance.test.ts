// 성과 수집(Phase 4) 단위 테스트 — 순수 로직만(DB·시각 무관). 라이브 적재는 scripts/ingest-performance.ts.
import { describe, it, expect } from "vitest";
import { judgeComponent, pickContentVerdict, type AbVerdict } from "../src/performance/abVerdict.js";
import { parsePerformanceFile } from "../src/performance/types.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };

describe("A/B 판정(judgeComponent)", () => {
  it("CTR 내림차순 rank + 최고가 winner", () => {
    const v = judgeComponent("thumbnail", [
      { variant: "A", ctr_pct: 5.0 },
      { variant: "B", ctr_pct: 6.8 },
      { variant: "C", ctr_pct: 4.1 },
    ], TH);
    expect(v.winner).toBe("B");
    expect(v.ranked.map((r) => r.variant)).toEqual(["B", "A", "C"]);
    expect(v.ranked.find((r) => r.variant === "B")?.is_winner).toBe(true);
    expect(v.ranked.find((r) => r.variant === "B")?.rank).toBe(1);
  });

  it("상대 리프트 ≥10% → decisive", () => {
    const v = judgeComponent("thumbnail", [{ variant: "A", ctr_pct: 5.0 }, { variant: "B", ctr_pct: 6.0 }], TH);
    expect(v.margin).toBeCloseTo(0.2, 5); // (6-5)/5
    expect(v.decisiveness).toBe("decisive");
    expect(v.decided).toBe(true);
  });

  it("3%~10% → marginal", () => {
    const v = judgeComponent("title", [{ variant: "A", ctr_pct: 5.0 }, { variant: "B", ctr_pct: 5.25 }], TH);
    expect(v.margin).toBeCloseTo(0.05, 5);
    expect(v.decisiveness).toBe("marginal");
  });

  it("3% 미만 → inconclusive(여전히 winner는 존재)", () => {
    const v = judgeComponent("title", [{ variant: "A", ctr_pct: 5.0 }, { variant: "B", ctr_pct: 5.1 }], TH);
    expect(v.decisiveness).toBe("inconclusive");
    expect(v.winner).toBe("B");
  });

  it("단일 변형 → 비교 불가(decided=false·decisiveness null)", () => {
    const v = judgeComponent("thumbnail", [{ variant: "A", ctr_pct: 6.0 }], TH);
    expect(v.winner).toBe("A");
    expect(v.decided).toBe(false);
    expect(v.decisiveness).toBeNull();
  });

  it("CTR null 변형은 winner 후보 제외·뒤 순위", () => {
    const v = judgeComponent("thumbnail", [{ variant: "A", ctr_pct: null }, { variant: "B", ctr_pct: 4.0 }], TH);
    expect(v.winner).toBe("B");
    expect(v.decided).toBe(false); // 유효 CTR 1개뿐
    expect(v.ranked[v.ranked.length - 1]?.variant).toBe("A");
  });

  it("전부 미측정 → winner null", () => {
    const v = judgeComponent("title", [{ variant: "A", ctr_pct: null }, { variant: "B", ctr_pct: null }], TH);
    expect(v.winner).toBeNull();
    expect(v.decided).toBe(false);
  });
});

describe("콘텐츠 대표 판정(pickContentVerdict)", () => {
  const decided = (component: "title" | "thumbnail", margin: number): AbVerdict => ({
    component, ranked: [], winner: "A", margin, decisiveness: "decisive", decided: true,
  });
  it("결정된 것 중 margin 큰 것", () => {
    const r = pickContentVerdict([decided("title", 0.12), decided("thumbnail", 0.30)]);
    expect(r?.component).toBe("thumbnail");
  });
  it("margin 동률이면 썸네일 우선", () => {
    const r = pickContentVerdict([decided("title", 0.2), decided("thumbnail", 0.2)]);
    expect(r?.component).toBe("thumbnail");
  });
  it("전부 미결이면 null", () => {
    const r = pickContentVerdict([{ component: "title", ranked: [], winner: "A", margin: null, decisiveness: null, decided: false }]);
    expect(r).toBeNull();
  });
});

describe("입력 파싱(parsePerformanceFile)", () => {
  it("정상 입력 파싱", () => {
    const { entries, errors } = parsePerformanceFile({
      entries: [{ youtube_video_id: "abc", metrics: [{ window: "d7", views: 100, ctr: 6.1 }], ab: [{ component: "thumbnail", variant: "A", ctr_pct: 5 }] }],
    });
    expect(errors).toEqual([]);
    expect(entries[0]?.metrics[0]?.avg_view_pct).toBeNull();
    expect(entries[0]?.ab?.[0]?.variant).toBe("A");
  });
  it("entries 누락 → 에러", () => {
    expect(parsePerformanceFile({}).errors.length).toBeGreaterThan(0);
  });
  it("영상 식별자 없음 → 에러", () => {
    const { errors } = parsePerformanceFile({ entries: [{ metrics: [{ window: "d7" }] }] });
    expect(errors.some((e) => e.includes("content_id"))).toBe(true);
  });
  it("잘못된 window → 에러", () => {
    const { errors } = parsePerformanceFile({ entries: [{ youtube_video_id: "x", metrics: [{ window: "d99" }] }] });
    expect(errors.some((e) => e.includes("window"))).toBe(true);
  });
  it("metrics 빈 배열 → 에러", () => {
    const { errors } = parsePerformanceFile({ entries: [{ youtube_video_id: "x", metrics: [] }] });
    expect(errors.some((e) => e.includes("metrics"))).toBe(true);
  });
  it("같은 window 중복 → 에러(upsert 한 행 두 번 갱신 차단)", () => {
    const { errors } = parsePerformanceFile({ entries: [{ youtube_video_id: "x", metrics: [{ window: "d7", views: 1 }, { window: "d7", views: 2 }] }] });
    expect(errors.some((e) => e.includes("window 중복"))).toBe(true);
  });
  it("같은 (component, variant) 중복 → 에러", () => {
    const { errors } = parsePerformanceFile({
      entries: [{ youtube_video_id: "x", metrics: [{ window: "d7" }], ab: [{ component: "thumbnail", variant: "A", ctr_pct: 5 }, { component: "thumbnail", variant: "A", ctr_pct: 6 }] }],
    });
    expect(errors.some((e) => e.includes("변형 중복"))).toBe(true);
  });
});
