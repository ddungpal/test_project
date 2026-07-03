// 확정 썸네일 손편집 반영 순수 헬퍼 — 편집 저장 후 화면 미반영 버그(localItems 미갱신) 픽스 검증.
import { describe, it, expect } from "vitest";
import { applyThumbnailEdit } from "../src/lib/thumbnail/applyEdit.js";

const items = [
  { idx: 0, payload: { thumbnail_main: ["A1", "A2"], thumbnail_boxes: ["ab1", "ab2"], ref_similarity: 0.1 } },
  { idx: 1, payload: { thumbnail_main: ["B1", "B2"], thumbnail_boxes: ["bb1", "bb2"], thumbnail_layout: "L2" } },
  { idx: 2, payload: { thumbnail_main: ["C1", "C2"], thumbnail_boxes: ["cb1", "cb2"] } },
];

describe("applyThumbnailEdit", () => {
  it("편집 카드의 메인/박스를 갱신한다", () => {
    const out = applyThumbnailEdit(items, 2, { thumbnail_main: ["새C1", "새C2"], thumbnail_boxes: ["새b1", "새b2"] });
    expect((out[2]!.payload as Record<string, unknown>).thumbnail_main).toEqual(["새C1", "새C2"]);
    expect((out[2]!.payload as Record<string, unknown>).thumbnail_boxes).toEqual(["새b1", "새b2"]);
  });

  it("편집 안 한 카드는 그대로 둔다(참조 동일)", () => {
    const out = applyThumbnailEdit(items, 2, { thumbnail_main: ["x", "y"], thumbnail_boxes: ["p", "q"] });
    expect(out[0]).toBe(items[0]);
    expect(out[1]).toBe(items[1]);
  });

  it("편집 카드의 다른 파생 필드(ref_similarity 등)는 보존한다", () => {
    const out = applyThumbnailEdit(items, 0, { thumbnail_main: ["z1", "z2"], thumbnail_boxes: ["z3", "z4"] });
    expect((out[0]!.payload as Record<string, unknown>).ref_similarity).toBe(0.1);
  });

  it("thumbnail_layout은 있으면 덮어쓰고 없으면 원래 값을 남긴다", () => {
    const withLayout = applyThumbnailEdit(items, 1, { thumbnail_main: ["a", "b"], thumbnail_boxes: ["c", "d"], thumbnail_layout: "L9" });
    expect((withLayout[1]!.payload as Record<string, unknown>).thumbnail_layout).toBe("L9");
    const noLayout = applyThumbnailEdit(items, 1, { thumbnail_main: ["a", "b"], thumbnail_boxes: ["c", "d"] });
    expect((noLayout[1]!.payload as Record<string, unknown>).thumbnail_layout).toBe("L2"); // 원래 값 보존
  });

  it("입력을 변형하지 않는다(순수)", () => {
    const snapshot = JSON.parse(JSON.stringify(items));
    applyThumbnailEdit(items, 0, { thumbnail_main: ["m"], thumbnail_boxes: ["n"] });
    expect(items).toEqual(snapshot);
  });

  it("payload가 객체가 아니어도 방어(크래시 없이 새 payload 생성)", () => {
    const weird = [{ idx: 0, payload: null }];
    const out = applyThumbnailEdit(weird, 0, { thumbnail_main: ["a"], thumbnail_boxes: ["b"] });
    expect((out[0]!.payload as Record<string, unknown>).thumbnail_main).toEqual(["a"]);
  });
});
