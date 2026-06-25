// 카피 학습 저장(copy-learning-admin step0) 단위 테스트 — 순수 매핑 함수만(DB·네트워크 무관).
//   라이브 저장은 서버액션 saveCopyAbResults(requireOwner·service-role) 경유.
import { describe, it, expect } from "vitest";
import { mapCopyAbToRows, mapCtr24hToMetricRow, type CopyAbInput } from "../src/app/actions/copyLearnMap.js";
import { judgeComponent, type AbScoreInput } from "../src/performance/abVerdict.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };
const CID = "content-uuid-1";

// 썸네일 3변형(A 38.8 > C 34.0 > B 27.1) + 제목 A/B 3변형(A 50 > B 30 > C 20).
const AB_INPUT: CopyAbInput = {
  contentId: CID,
  ctr24h: 6.4,
  thumbnail: [
    { variant: "A", copyMain: ["절대 깨지 마세요"], copyBoxes: ["3년"], watchShare: 38.8 },
    { variant: "B", copyMain: ["이것만 알면 ISA"], copyBoxes: [], watchShare: 27.1 },
    { variant: "C", copyMain: ["ETF 팔기 전"], copyBoxes: ["5억원"], watchShare: 34.0 },
  ],
  title: {
    hasAbTest: true,
    variants: [
      { variant: "A", text: "ISA 3년 만기 전략", watchShare: 50 },
      { variant: "B", text: "ISA 이것만 알면", watchShare: 30 },
      { variant: "C", text: "ISA 깨면 손해", watchShare: 20 },
    ],
  },
};

// 제목 단일 모드(A/B 없음) — 썸네일은 동일.
const SINGLE_TITLE_INPUT: CopyAbInput = {
  contentId: CID,
  ctr24h: 5.0,
  thumbnail: AB_INPUT.thumbnail,
  title: { hasAbTest: false, variants: [{ variant: "A", text: "최종 제목 하나", watchShare: null }] },
};

describe("mapCopyAbToRows — 썸네일 매핑", () => {
  it("썸네일 3변형 모두 component_type='thumbnail'·content_id 채움", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const thumbs = abRows.filter((r) => r.component_type === "thumbnail");
    expect(thumbs).toHaveLength(3);
    for (const r of thumbs) expect(r.content_id).toBe(CID);
  });

  it("payload는 {copy_main, copy_boxes}, ctr_pct=watchShare", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const a = abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A");
    const p = a?.payload as Record<string, unknown>;
    expect(p.copy_main).toEqual(["절대 깨지 마세요"]);
    expect(p.copy_boxes).toEqual(["3년"]);
    expect(a?.ctr_pct).toBe(38.8);
    expect(a?.impressions).toBeNull();
    expect(a?.weight).toBeNull();
  });

  it("빈 문자열·공백은 payload에서 제거(누출 차단)", () => {
    const dirty: CopyAbInput = {
      ...AB_INPUT,
      thumbnail: [{ variant: "A", copyMain: ["  유효  ", "", "   "], copyBoxes: [""], watchShare: 10 }],
    };
    const { abRows } = mapCopyAbToRows(dirty, CID, TH);
    const p = abRows.find((r) => r.component_type === "thumbnail")?.payload as Record<string, unknown>;
    expect(p.copy_main).toEqual(["유효"]);
    expect(p.copy_boxes).toEqual([]);
  });

  it("rank·is_winner는 judgeComponent('thumbnail') 재계산과 일치(입력 맹신 안 함)", () => {
    const { abRows, thumbnailVerdict } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const scoreInputs: AbScoreInput[] = AB_INPUT.thumbnail.map((t) => ({ variant: t.variant, ctr_pct: t.watchShare, impressions: null }));
    const verdict = judgeComponent("thumbnail", scoreInputs, TH);
    for (const rv of verdict.ranked) {
      const row = abRows.find((r) => r.component_type === "thumbnail" && r.variant === rv.variant);
      expect(row?.rank).toBe(rv.rank);
      expect(row?.is_winner).toBe(rv.is_winner);
    }
    // 38.8 > 34.0 > 27.1 → A(rank1·winner) > C(rank2) > B(rank3).
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A")?.rank).toBe(1);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "A")?.is_winner).toBe(true);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "C")?.rank).toBe(2);
    expect(abRows.find((r) => r.component_type === "thumbnail" && r.variant === "B")?.is_winner).toBe(false);
    expect(thumbnailVerdict?.winner).toBe("A");
  });
});

describe("mapCopyAbToRows — 제목 A/B 모드", () => {
  it("제목 3변형, payload={title}, judgeComponent('title') 재계산", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const titles = abRows.filter((r) => r.component_type === "title");
    expect(titles).toHaveLength(3);
    const a = titles.find((r) => r.variant === "A");
    expect((a?.payload as Record<string, unknown>).title).toBe("ISA 3년 만기 전략");
    // 50 > 30 > 20 → A 승자.
    expect(a?.rank).toBe(1);
    expect(a?.is_winner).toBe(true);
    expect(titles.find((r) => r.variant === "C")?.rank).toBe(3);
  });
});

describe("mapCopyAbToRows — 제목 단일 모드", () => {
  it("variant='A' 1행, ctr_pct=null, is_winner=true, A/B 판정 안 함", () => {
    const { abRows } = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    const titles = abRows.filter((r) => r.component_type === "title");
    expect(titles).toHaveLength(1);
    const a = titles[0];
    expect(a?.variant).toBe("A");
    expect((a?.payload as Record<string, unknown>).title).toBe("최종 제목 하나");
    expect(a?.ctr_pct).toBeNull();
    expect(a?.is_winner).toBe(true);
    expect(a?.rank).toBe(1);
  });
});

describe("mapCtr24hToMetricRow — performance d1 overall", () => {
  it("1행, metric_window='d1', ab_variant='overall', ctr=ctr24h", () => {
    const row = mapCtr24hToMetricRow(AB_INPUT, CID, "2026-06-25T00:00:00.000Z");
    expect(row.content_id).toBe(CID);
    expect(row.metric_window).toBe("d1");
    expect(row.ab_variant).toBe("overall");
    expect(row.ctr).toBe(6.4);
    expect(row.recorded_at).toBe("2026-06-25T00:00:00.000Z");
  });

  it("ctr24h=null이면 ctr=null", () => {
    const row = mapCtr24hToMetricRow({ ...AB_INPUT, ctr24h: null }, CID, "2026-06-25T00:00:00.000Z");
    expect(row.ctr).toBeNull();
  });
});

describe("멱등성 — 같은 입력 2회 동일 결과", () => {
  it("ab_variants 매핑 2회 동일(A/B 모드)", () => {
    const first = mapCopyAbToRows(AB_INPUT, CID, TH);
    const second = mapCopyAbToRows(AB_INPUT, CID, TH);
    expect(second.abRows).toEqual(first.abRows);
  });

  it("ab_variants 매핑 2회 동일(단일 제목 모드)", () => {
    const first = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    const second = mapCopyAbToRows(SINGLE_TITLE_INPUT, CID, TH);
    expect(second.abRows).toEqual(first.abRows);
  });

  it("onConflict 키(content_id·component_type·variant)가 유일", () => {
    const { abRows } = mapCopyAbToRows(AB_INPUT, CID, TH);
    const keys = abRows.map((r) => `${r.content_id}:${r.component_type}:${r.variant}`);
    expect(new Set(keys).size).toBe(abRows.length);
  });
});
