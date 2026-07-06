// 제목 후보 보관(title-shortlist) 순수 로직 단위 테스트 — DOM·서버·컴포넌트 무관(순수 함수만).
//   ★ 컴포넌트 import 금지(vitest @/ alias 없음 함정) — src/lib/title/alternates.ts만 물린다.
//   mergeAlternates: 정상 부착·중복/빈문자 제거·상한·불변식(빈 후보면 primary와 deep-equal).
//   promotePrimary: 대표↔후보 맞교환·나머지 필드 보존·범위 밖/없음 무변경.
import { describe, it, expect } from "vitest";
import type { TitlePayload } from "../src/lib/dashboard/proposalTypes.js";
import { mergeAlternates, promotePrimary } from "../src/lib/title/alternates.js";

function primary(over: Partial<TitlePayload> = {}): TitlePayload {
  return {
    title: "대표 제목",
    thumbnail_layout: "layout-A",
    thumbnail_main: ["메인1", "메인2"],
    thumbnail_boxes: ["박스1", "박스2"],
    ...over,
  };
}

describe("mergeAlternates — 후보 부착·정제", () => {
  it("후보 2개 정상 부착", () => {
    const result = mergeAlternates(primary(), ["후보2", "후보3"]);
    expect(result.alternates).toEqual(["후보2", "후보3"]);
    expect(result.title).toBe("대표 제목");
  });

  it("나머지 필드는 그대로 보존", () => {
    const result = mergeAlternates(primary(), ["후보2"]);
    expect(result.thumbnail_layout).toBe("layout-A");
    expect(result.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(result.thumbnail_boxes).toEqual(["박스1", "박스2"]);
  });

  it("대표 title과 중복인 후보는 제거(양쪽 트림 비교)", () => {
    const result = mergeAlternates(primary(), ["  대표 제목  ", "후보2"]);
    expect(result.alternates).toEqual(["후보2"]);
  });

  it("빈문자·공백 후보 제거", () => {
    const result = mergeAlternates(primary(), ["", "   ", "후보2"]);
    expect(result.alternates).toEqual(["후보2"]);
  });

  it("후보 저장값은 트림된다", () => {
    const result = mergeAlternates(primary(), ["  후보2  "]);
    expect(result.alternates).toEqual(["후보2"]);
  });

  it("후보 서로간 중복 제거(트림 후)", () => {
    const result = mergeAlternates(primary(), ["후보2", " 후보2 ", "후보3"]);
    expect(result.alternates).toEqual(["후보2", "후보3"]);
  });

  it("상한 초과(3개 넣으면 2개만)", () => {
    const result = mergeAlternates(primary(), ["후보2", "후보3", "후보4"]);
    expect(result.alternates).toEqual(["후보2", "후보3"]);
  });

  it("불변식: 후보 0개면 primary와 deep-equal·alternates 키 없음", () => {
    const p = primary();
    const result = mergeAlternates(p, []);
    expect(result).toEqual(p);
    expect("alternates" in result).toBe(false);
  });

  it("불변식: 후보가 전부 정제 탈락하면 primary와 deep-equal·alternates 키 없음", () => {
    const p = primary();
    const result = mergeAlternates(p, ["", "  ", "대표 제목"]); // 전부 탈락
    expect(result).toEqual(p);
    expect("alternates" in result).toBe(false);
  });

  it("입력 primary·extraTitles를 변형하지 않는다(순수)", () => {
    const p = primary();
    const extra = ["후보2", "후보3"];
    mergeAlternates(p, extra);
    expect(p).toEqual(primary());
    expect(extra).toEqual(["후보2", "후보3"]);
  });
});

describe("promotePrimary — 대표↔후보 맞교환", () => {
  it("대표와 후보를 맞교환한다", () => {
    const p = primary({ alternates: ["후보2", "후보3"] });
    const result = promotePrimary(p, 0);
    expect(result.title).toBe("후보2");
    expect(result.alternates).toEqual(["대표 제목", "후보3"]); // 이전 대표가 같은 자리에·길이 유지
  });

  it("altIndex 1도 정확히 스왑", () => {
    const p = primary({ alternates: ["후보2", "후보3"] });
    const result = promotePrimary(p, 1);
    expect(result.title).toBe("후보3");
    expect(result.alternates).toEqual(["후보2", "대표 제목"]);
  });

  it("나머지 필드(thumbnail_layout 등) 보존", () => {
    const p = primary({ alternates: ["후보2"] });
    const result = promotePrimary(p, 0);
    expect(result.thumbnail_layout).toBe("layout-A");
    expect(result.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(result.thumbnail_boxes).toEqual(["박스1", "박스2"]);
  });

  it("범위 밖 index는 무변경", () => {
    const p = primary({ alternates: ["후보2"] });
    expect(promotePrimary(p, 5)).toBe(p);
    expect(promotePrimary(p, -1)).toBe(p);
  });

  it("alternates 없으면 무변경", () => {
    const p = primary();
    expect(promotePrimary(p, 0)).toBe(p);
  });

  it("입력 payload를 변형하지 않는다(순수)", () => {
    const p = primary({ alternates: ["후보2", "후보3"] });
    promotePrimary(p, 0);
    expect(p.title).toBe("대표 제목");
    expect(p.alternates).toEqual(["후보2", "후보3"]);
  });
});
