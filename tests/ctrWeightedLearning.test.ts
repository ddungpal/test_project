// CTR 합성 가중(ctrWeightedScore) + DB 학습 소스(loadAbResultsFromDb) 순수/목 테스트 — DB·LLM 무관.
//   copy-learning-admin step1: CTR(24h) × A/B(영상 내 귀속) 합성, 제목 단일 CTR 상관, DB→AbResultVideo 매핑.
import { describe, it, expect } from "vitest";
import { ctrWeightedScore, verdictWeight, type CtrWeightArgs } from "../src/performance/abVerdict.js";
import { loadAbResultsFromDb } from "../src/performance/abLearnSource.js";
import type { Supa } from "../src/pipeline/runState.js";

// config.ab 형태(judgeComponent thresholds + CTR 정규화 상수).
const TH = { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3 };

describe("ctrWeightedScore (CTR 합성 가중)", () => {
  it("CTR 없으면(videoCtr24h=null) ab 모드는 verdictWeight 와 정확히 동일(하위호환)", () => {
    expect(ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: null, mode: "ab" }, TH)).toBe(verdictWeight("decisive"));
    expect(ctrWeightedScore({ decisiveness: "marginal", videoCtr24h: null, mode: "ab" }, TH)).toBe(verdictWeight("marginal"));
    // lift 동반 시에도 동일.
    expect(ctrWeightedScore({ decisiveness: "decisive", relativeLiftPct: 12.4, videoCtr24h: null, mode: "ab" }, TH)).toBe(
      verdictWeight("decisive", 12.4),
    );
  });

  it("ab 모드: CTR 이 높을수록 가중이 커진다(단조)", () => {
    const low = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 2, mode: "ab" }, TH);
    const high = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 8, mode: "ab" }, TH);
    expect(high).toBeGreaterThan(low);
    // CTR 있으면 base(verdictWeight)보다 크다(boost>0).
    expect(low).toBeGreaterThan(verdictWeight("decisive"));
  });

  it("ab 모드: 같은 CTR 이면 decisive 가 marginal 보다 큰 가중", () => {
    const dec = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, TH);
    const mar = ctrWeightedScore({ decisiveness: "marginal", videoCtr24h: 6, mode: "ab" }, TH);
    expect(dec).toBeGreaterThan(mar);
  });

  it("ab 모드: inconclusive 는 CTR 이 아무리 커도 0(positive 학습 제외)", () => {
    expect(ctrWeightedScore({ decisiveness: "inconclusive", videoCtr24h: 9, mode: "ab" }, TH)).toBe(0);
    expect(ctrWeightedScore({ decisiveness: "inconclusive", videoCtr24h: null, mode: "ab" }, TH)).toBe(0);
  });

  it("ab 모드: CTR 상한(ctrNormCap)을 넘으면 같은 신호로 클램프된다", () => {
    const atCap = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: TH.ctrNormCap, mode: "ab" }, TH);
    const over = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 1000, mode: "ab" }, TH);
    expect(over).toBe(atCap);
    // 폭주하지 않는다(상한 가중 < base×(1+boost)).
    expect(atCap).toBeLessThanOrEqual(verdictWeight("decisive") * (1 + TH.ctrBoostFactor));
  });

  it("single 모드: CTR 크기 자체가 가중(고CTR=강신호), CTR 없으면 0", () => {
    const low = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 2, mode: "single" }, TH);
    const high = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 8, mode: "single" }, TH);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
    // CTR 없음 → 비교 신호 없음 → 0.
    expect(ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: null, mode: "single" }, TH)).toBe(0);
  });

  it("single 모드: 상한 클램프([0,1] 정규화) — 큰 CTR 도 1 을 넘지 않는다", () => {
    const args: CtrWeightArgs = { decisiveness: "decisive", videoCtr24h: 9999, mode: "single" };
    const w = ctrWeightedScore(args, TH);
    expect(w).toBeLessThanOrEqual(1);
    expect(w).toBeGreaterThan(0);
  });

  it("ctrBoostFactor=0 이면 ab 모드는 CTR 무가중(verdictWeight 동일)", () => {
    const noBoost = { ...TH, ctrBoostFactor: 0 };
    expect(ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 8, mode: "ab" }, noBoost)).toBe(verdictWeight("decisive"));
  });
});

// 24h 조회수 신뢰도 가중(vconf) — views/reference 없으면 무가중(하위호환). TH 에 viewsConfFloor 포함.
const THV = { ...TH, viewsConfFloor: 0.5 };

describe("ctrWeightedScore — 조회수 신뢰도 가중(vconf)", () => {
  it("views/reference 둘 다 미지정 → 기존 값과 동일(하위호환 회귀 가드)", () => {
    // THV(floor 포함)·TH(floor 미지정) 모두 views 없으면 vconf=1.0 → 기존과 동일.
    expect(ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, THV)).toBe(
      ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, TH),
    );
    expect(ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "single" }, THV)).toBe(
      ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "single" }, TH),
    );
  });

  it("내부 기본 floor=0.5: viewsConfFloor 미지정(TH)이어도 views 케이스가 동작한다", () => {
    // TH 엔 viewsConfFloor 없음 → 내부 기본 0.5 적용. views=0 → vconf=floor=0.5.
    const base = verdictWeight("decisive");
    const w = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: null, videoViews24h: 0, viewsReference: 1000, mode: "ab" }, TH);
    expect(w).toBeCloseTo(base * 0.5, 10);
  });

  it("ab 모드: views=reference(최고 reach) → vconf=1.0 → 기존과 동일", () => {
    const ref = 50_000;
    const withViews = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: ref, viewsReference: ref, mode: "ab" },
      THV,
    );
    const baseline = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, THV);
    expect(withViews).toBeCloseTo(baseline, 10);
  });

  it("ab 모드: views≪reference(저조회) → 점수 < 기존, 단 >= base*(...)*floor", () => {
    const ref = 50_000;
    const baseline = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, THV);
    const low = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: 500, viewsReference: ref, mode: "ab" },
      THV,
    );
    expect(low).toBeLessThan(baseline); // 저조회 → 약화.
    expect(low).toBeGreaterThanOrEqual(baseline * THV.viewsConfFloor); // floor 아래로 안 죽임.
  });

  it("single 모드: vconf 가 동일하게 곱해짐. reference null → vconf=1.0", () => {
    const ref = 50_000;
    const baseline = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "single" }, THV);
    const low = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: 500, viewsReference: ref, mode: "single" },
      THV,
    );
    expect(low).toBeLessThan(baseline);
    expect(low).toBeGreaterThanOrEqual(baseline * THV.viewsConfFloor);
    // reference null → vconf=1.0 → baseline 과 동일.
    const refNull = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: 500, viewsReference: null, mode: "single" },
      THV,
    );
    expect(refNull).toBeCloseTo(baseline, 10);
  });

  it("경계: views=0 → vconf=floor", () => {
    const base = verdictWeight("decisive");
    const w = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: null, videoViews24h: 0, viewsReference: 1000, mode: "ab" }, THV);
    expect(w).toBeCloseTo(base * THV.viewsConfFloor, 10);
  });

  it("경계: views 음수/NaN → vconf=1.0(방어)", () => {
    const baseline = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, THV);
    const neg = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: -100, viewsReference: 1000, mode: "ab" },
      THV,
    );
    const nan = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: NaN, viewsReference: 1000, mode: "ab" },
      THV,
    );
    // 음수·NaN views 둘 다 무가중 방어 → vconf=1.0 → baseline 과 동일.
    expect(neg).toBeCloseTo(baseline, 10);
    expect(nan).toBeCloseTo(baseline, 10);
  });

  it("경계: reference<=0 → vconf=1.0", () => {
    const baseline = ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, mode: "ab" }, THV);
    const zeroRef = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: 500, viewsReference: 0, mode: "ab" },
      THV,
    );
    const negRef = ctrWeightedScore(
      { decisiveness: "decisive", videoCtr24h: 6, videoViews24h: 500, viewsReference: -5, mode: "ab" },
      THV,
    );
    expect(zeroRef).toBeCloseTo(baseline, 10);
    expect(negRef).toBeCloseTo(baseline, 10);
  });

  it("vconf 단조성: views↑ → vconf↑(같은 reference)", () => {
    const ref = 50_000;
    const mk = (views: number) =>
      ctrWeightedScore({ decisiveness: "decisive", videoCtr24h: 6, videoViews24h: views, viewsReference: ref, mode: "ab" }, THV);
    const a = mk(1_000);
    const b = mk(10_000);
    const c = mk(40_000);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("inconclusive 는 vconf 무관 항상 0(일찍 return)", () => {
    expect(
      ctrWeightedScore({ decisiveness: "inconclusive", videoCtr24h: 6, videoViews24h: 50_000, viewsReference: 50_000, mode: "ab" }, THV),
    ).toBe(0);
  });
});

// ── loadAbResultsFromDb 목 supa ──

interface MockTables {
  ab_variants: Record<string, unknown>[];
  contents: Record<string, unknown>[];
  performance_metrics: Record<string, unknown>[];
}

/** 테이블·필터를 추적하는 체이너블 목 supa. 종료(await/thenable)에서 필터된 rows 반환. */
function makeMockSupa(tables: MockTables): Supa {
  const from = (table: keyof MockTables) => {
    const filters: { col: string; val: unknown }[] = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    };
    chain.in = (col: string, vals: unknown[]) => {
      filters.push({ col, val: vals });
      return chain;
    };
    const resolve = () => {
      let rows = tables[table] ?? [];
      for (const f of filters) {
        rows = rows.filter((r) =>
          Array.isArray(f.val) ? (f.val as unknown[]).includes(r[f.col]) : r[f.col] === f.val,
        );
      }
      return { data: rows, error: null };
    };
    chain.then = (onF: (v: unknown) => unknown) => onF(resolve());
    return chain;
  };
  return { from } as unknown as Supa;
}

describe("loadAbResultsFromDb (DB 학습 소스 매핑)", () => {
  it("thumbnail A/B: ab_variants + 영상 CTR → AbResultVideo(영상 내 비교)", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "c1", component_type: "thumbnail", variant: "A", payload: { copy_main: "절대 깨지 마세요" }, ctr_pct: 38.8, is_winner: true },
        { content_id: "c1", component_type: "thumbnail", variant: "B", payload: { copy_main: "이것만 알면" }, ctr_pct: 27.1, is_winner: false },
      ],
      contents: [{ id: "c1", title: "ISA", topic: "ISA 3년" }],
      performance_metrics: [{ content_id: "c1", ctr: 6.4, views: 120000, metric_window: "d1", ab_variant: "overall" }],
    });
    const videos = await loadAbResultsFromDb(supa, "thumbnail");
    expect(videos).toHaveLength(1);
    const v = videos[0]!;
    expect(v.topic).toBe("ISA 3년");
    expect(v.video_ctr24h).toBe(6.4);
    expect(v.video_views24h).toBe(120000); // performance_metrics.views → video_views24h 매핑.
    expect(v.learn_mode).toBeUndefined(); // A/B 경로 → mode 미지정(=ab)
    expect(v.variants).toHaveLength(2);
    const a = v.variants.find((x) => x.variant === "A")!;
    expect(a.is_winner).toBe(true);
    expect(a.watch_share_pct).toBe(38.8);
    expect(a.copy_main).toBe("절대 깨지 마세요");
  });

  it("title A/B(변형 ≥2): component_type='title' 만 읽고 영상 내 비교로 매핑", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "c1", component_type: "title", variant: "A", payload: { title: "연봉 3천 이하 보세요" }, ctr_pct: 7.1, is_winner: true },
        { content_id: "c1", component_type: "title", variant: "B", payload: { title: "재테크 초보 가이드" }, ctr_pct: 5.0, is_winner: false },
        // 썸네일 행은 무시돼야 한다(component 필터).
        { content_id: "c1", component_type: "thumbnail", variant: "A", payload: { copy_main: "무시" }, ctr_pct: 30, is_winner: true },
      ],
      contents: [{ id: "c1", title: "연봉", topic: "연봉 협상" }],
      performance_metrics: [{ content_id: "c1", ctr: 7.0, metric_window: "d1", ab_variant: "overall" }],
    });
    const videos = await loadAbResultsFromDb(supa, "title");
    expect(videos).toHaveLength(1);
    const v = videos[0]!;
    expect(v.learn_mode).toBeUndefined(); // A/B 경로
    expect(v.variants).toHaveLength(2); // 썸네일 행 제외 — 제목 A/B 2개만
    const a = v.variants.find((x) => x.variant === "A")!;
    expect(a.copy_main).toBe("연봉 3천 이하 보세요"); // payload.title → copy_main 슬롯
  });

  it("title 단일(영상당 variant 1개): 영상간 CTR 순위로 single 합성(상위=winner)", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "hi", component_type: "title", variant: "A", payload: { title: "고CTR 제목" }, ctr_pct: null, is_winner: true },
        { content_id: "lo", component_type: "title", variant: "A", payload: { title: "저CTR 제목" }, ctr_pct: null, is_winner: true },
      ],
      contents: [
        { id: "hi", title: "hi", topic: "고성과" },
        { id: "lo", title: "lo", topic: "저성과" },
      ],
      performance_metrics: [
        { content_id: "hi", ctr: 9.0, metric_window: "d1", ab_variant: "overall" },
        { content_id: "lo", ctr: 2.0, metric_window: "d1", ab_variant: "overall" },
      ],
    });
    const videos = await loadAbResultsFromDb(supa, "title");
    expect(videos).toHaveLength(2);
    for (const v of videos) expect(v.learn_mode).toBe("single");
    const hi = videos.find((v) => v.topic === "고성과")!;
    const lo = videos.find((v) => v.topic === "저성과")!;
    expect(hi.video_ctr24h).toBe(9.0);
    expect(lo.video_ctr24h).toBe(2.0);
    // 고성과 영상은 자기 제목 winner + 최하위(저성과) loser 대조.
    const hiWinner = hi.variants.find((x) => x.is_winner)!;
    expect(hiWinner.copy_main).toBe("고CTR 제목");
    expect(hi.variants.some((x) => !x.is_winner)).toBe(true); // loser 대조 존재
    // 최하위 자신은 loser 대조를 안 붙인다(자기 자신).
    expect(lo.variants).toHaveLength(1);
  });

  it("표본 없으면 빈 배열(no-op 안전)", async () => {
    const supa = makeMockSupa({ ab_variants: [], contents: [], performance_metrics: [] });
    expect(await loadAbResultsFromDb(supa, "thumbnail")).toEqual([]);
    expect(await loadAbResultsFromDb(supa, "title")).toEqual([]);
  });

  // ── 학습 윈도우 d7 우선·d1 폴백(learning-window-d7) ──

  it("d7 우선: 한 영상에 d1·d7 둘 다 있으면 랭킹 CTR·views 는 d7 값을 쓴다", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "c1", component_type: "thumbnail", variant: "A", payload: { copy_main: "A" }, ctr_pct: 30, is_winner: true },
        { content_id: "c1", component_type: "thumbnail", variant: "B", payload: { copy_main: "B" }, ctr_pct: 20, is_winner: false },
      ],
      contents: [{ id: "c1", title: "t", topic: "주제" }],
      performance_metrics: [
        { content_id: "c1", ctr: 3.0, views: 1000, metric_window: "d1", ab_variant: "overall" },
        { content_id: "c1", ctr: 5.0, views: 8000, metric_window: "d7", ab_variant: "overall" },
      ],
    });
    const videos = await loadAbResultsFromDb(supa, "thumbnail");
    expect(videos).toHaveLength(1);
    // d7(=업로드 1주일 성과)이 video_ctr24h/video_views24h 필드에 실린다.
    expect(videos[0]!.video_ctr24h).toBe(5.0);
    expect(videos[0]!.video_views24h).toBe(8000);
  });

  it("d1 폴백: d7 행이 없고 d1 만 있으면 d1 값을 쓴다", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "c1", component_type: "thumbnail", variant: "A", payload: { copy_main: "A" }, ctr_pct: 30, is_winner: true },
        { content_id: "c1", component_type: "thumbnail", variant: "B", payload: { copy_main: "B" }, ctr_pct: 20, is_winner: false },
      ],
      contents: [{ id: "c1", title: "t", topic: "주제" }],
      performance_metrics: [{ content_id: "c1", ctr: 3.0, views: 1000, metric_window: "d1", ab_variant: "overall" }],
    });
    const videos = await loadAbResultsFromDb(supa, "thumbnail");
    expect(videos[0]!.video_ctr24h).toBe(3.0);
    expect(videos[0]!.video_views24h).toBe(1000);
  });

  it("둘 다 없으면 null(안전 강등 유지)", async () => {
    const supa = makeMockSupa({
      ab_variants: [
        { content_id: "c1", component_type: "thumbnail", variant: "A", payload: { copy_main: "A" }, ctr_pct: 30, is_winner: true },
        { content_id: "c1", component_type: "thumbnail", variant: "B", payload: { copy_main: "B" }, ctr_pct: 20, is_winner: false },
      ],
      contents: [{ id: "c1", title: "t", topic: "주제" }],
      performance_metrics: [],
    });
    const videos = await loadAbResultsFromDb(supa, "thumbnail");
    expect(videos[0]!.video_ctr24h).toBeNull();
    expect(videos[0]!.video_views24h).toBeNull();
  });
});
