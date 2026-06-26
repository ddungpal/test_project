// rankWinningThumbnails 순수함수 단위테스트(thumbnail-winning-refs step0).
//   score = watchShare × ctr × viewsConfidence(views, viewsReference, floor). null 인자는 ×1.
//   DB 로더(loadWinningThumbnailRefs)는 순수성 없어 여기선 다루지 않음(parity 패턴).

import { describe, expect, it } from "vitest";
import { rankWinningThumbnails, type WinningRow } from "../src/agents/thumbnail_maker/winningRefs.js";

const FLOOR = 0.5;

function row(over: Partial<WinningRow> = {}): WinningRow {
  return {
    content_id: "c1",
    topic: "주제",
    main: ["메인문구"],
    boxes: ["박스"],
    watchShare: 1,
    ctr: 1,
    views: 100,
    ...over,
  };
}

describe("rankWinningThumbnails", () => {
  it("빈 입력 → []", () => {
    expect(rankWinningThumbnails([], 100, FLOOR, 8)).toEqual([]);
  });

  it("성과순 정렬: watchShare·ctr·views 높은 행이 앞", () => {
    const rows = [
      row({ content_id: "low", watchShare: 0.2, ctr: 2, views: 100 }),
      row({ content_id: "high", watchShare: 0.8, ctr: 5, views: 1000 }),
      row({ content_id: "mid", watchShare: 0.5, ctr: 3, views: 500 }),
    ];
    const out = rankWinningThumbnails(rows, 1000, FLOOR, 8);
    expect(out.map((r) => r.id)).toEqual(["style:winner:high", "style:winner:mid", "style:winner:low"]);
  });

  it("동률이면 views 큰 쪽 먼저(tie-break)", () => {
    // watchShare·ctr 동일 → score 는 views(vconf)로만 갈림. 명시적 동률 확인 위해 viewsReference null(vconf=1.0)로 score 동률 만들고 tie-break 확인.
    const rows = [
      row({ content_id: "fewer", watchShare: 1, ctr: 1, views: 100 }),
      row({ content_id: "more", watchShare: 1, ctr: 1, views: 900 }),
    ];
    const out = rankWinningThumbnails(rows, null, FLOOR, 8); // viewsReference null → vconf=1.0 둘 다 → score 동률 → views tie-break.
    expect(out.map((r) => r.id)).toEqual(["style:winner:more", "style:winner:fewer"]);
  });

  it("limit 절단: 10개·limit 8 → 8개", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ content_id: `c${i}`, watchShare: i + 1 }));
    const out = rankWinningThumbnails(rows, 1000, FLOOR, 8);
    expect(out).toHaveLength(8);
  });

  it("null 안전: watchShare/ctr null 인 행도 ×1 로 점수 계산(크래시 없음)", () => {
    const rows = [
      row({ content_id: "nulls", watchShare: null, ctr: null, views: 100 }),
      row({ content_id: "strong", watchShare: 2, ctr: 2, views: 100 }),
    ];
    const out = rankWinningThumbnails(rows, 100, FLOOR, 8);
    // nulls 행이 떨어지지 않고 포함됨(우승작 누락 방지).
    expect(out.map((r) => r.id).sort()).toEqual(["style:winner:nulls", "style:winner:strong"]);
    // strong(2×2=4) > nulls(1×1=1) → strong 먼저.
    expect(out[0]?.id).toBe("style:winner:strong");
  });

  it("views null → vconf=1.0(크래시 없음, watchShare·ctr 로만 정렬)", () => {
    const rows = [
      row({ content_id: "a", watchShare: 1, ctr: 1, views: null }),
      row({ content_id: "b", watchShare: 3, ctr: 1, views: null }),
    ];
    const out = rankWinningThumbnails(rows, 1000, FLOOR, 8);
    expect(out.map((r) => r.id)).toEqual(["style:winner:b", "style:winner:a"]);
  });

  it("main 빈 행(main:[])은 제외", () => {
    const rows = [
      row({ content_id: "empty", main: [], watchShare: 10, ctr: 10 }), // 점수 높아도 main 없으면 제외.
      row({ content_id: "ok", main: ["문구"], watchShare: 1, ctr: 1 }),
    ];
    const out = rankWinningThumbnails(rows, 100, FLOOR, 8);
    expect(out.map((r) => r.id)).toEqual(["style:winner:ok"]);
  });

  it("viewsReference null/0 → vconf=1.0 이어도 watchShare·ctr 로 정렬", () => {
    const rows = [
      row({ content_id: "small", watchShare: 0.5, ctr: 1, views: 100 }),
      row({ content_id: "big", watchShare: 0.9, ctr: 1, views: 100 }),
    ];
    expect(rankWinningThumbnails(rows, null, FLOOR, 8).map((r) => r.id)).toEqual(["style:winner:big", "style:winner:small"]);
    expect(rankWinningThumbnails(rows, 0, FLOOR, 8).map((r) => r.id)).toEqual(["style:winner:big", "style:winner:small"]);
  });

  it("payload 카피 전달: main/boxes 그대로 반환", () => {
    const out = rankWinningThumbnails([row({ content_id: "c", main: ["곱버스", "이유"], boxes: ["박스1", "박스2"] })], 100, FLOOR, 8);
    expect(out[0]?.main).toEqual(["곱버스", "이유"]);
    expect(out[0]?.boxes).toEqual(["박스1", "박스2"]);
  });
});
