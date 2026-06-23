// 채택률 신호 집계(Phase D step0) 단위 테스트 — 순수 로직만(DB·시각 무관).
import { describe, it, expect } from "vitest";
import {
  computeAdoptionSignal,
  isAdoptedAsIs,
  type AdoptionRow,
} from "../src/performance/adoptionSignal.js";

describe("isAdoptedAsIs — 그대로 채택 판정(보수적)", () => {
  it("edit_distance=0 & edited_payload=null → 그대로 채택", () => {
    expect(isAdoptedAsIs({ stage: "topic", edit_distance: 0, edited_payload: null })).toBe(true);
  });

  it("edit_distance=null & edited_payload=null → 그대로 채택(수정 신호 없음)", () => {
    expect(isAdoptedAsIs({ stage: "topic", edit_distance: null, edited_payload: null })).toBe(true);
  });

  it("edited_payload 존재 → 수정", () => {
    expect(isAdoptedAsIs({ stage: "topic", edit_distance: 0, edited_payload: { a: 1 } })).toBe(false);
  });

  it("edit_distance>0 → 수정", () => {
    expect(isAdoptedAsIs({ stage: "topic", edit_distance: 3, edited_payload: null })).toBe(false);
  });
});

describe("computeAdoptionSignal — 단계별 집계", () => {
  it("섞인 입력(그대로 채택 + 수정, 여러 stage) → stage별 비율·평균 정확", () => {
    const rows: AdoptionRow[] = [
      // topic: 4건 중 2건 그대로 채택. edit_distance 수치 행 = 3건(0,5,3) → 평균 8/3
      { stage: "topic", edit_distance: 0, edited_payload: null }, // 그대로
      { stage: "topic", edit_distance: null, edited_payload: null }, // 그대로(null은 평균 제외)
      { stage: "topic", edit_distance: 5, edited_payload: null }, // 수정
      { stage: "topic", edit_distance: 3, edited_payload: { x: 1 } }, // 수정
      // title_thumb: 2건 중 1건 그대로. edit_distance 수치 행 = 2건(0,10) → 평균 5
      { stage: "title_thumb", edit_distance: 0, edited_payload: null }, // 그대로
      { stage: "title_thumb", edit_distance: 10, edited_payload: null }, // 수정
    ];
    const r = computeAdoptionSignal(rows);

    expect(r["topic"]).toEqual({ n: 4, adoptedAsIs: 2, adoptionRate: 0.5, avgEditDistance: 8 / 3 });
    expect(r["title_thumb"]).toEqual({ n: 2, adoptedAsIs: 1, adoptionRate: 0.5, avgEditDistance: 5 });
    expect(Object.keys(r).sort()).toEqual(["title_thumb", "topic"]);
  });

  it("그대로 채택만 있는 stage → adoptionRate=1, avgEditDistance=0(수치 없음)", () => {
    const rows: AdoptionRow[] = [
      { stage: "script", edit_distance: null, edited_payload: null },
      { stage: "script", edit_distance: 0, edited_payload: null },
    ];
    const r = computeAdoptionSignal(rows);
    expect(r["script"]).toEqual({ n: 2, adoptedAsIs: 2, adoptionRate: 1, avgEditDistance: 0 });
  });

  it("전부 수정된 stage → adoptionRate=0", () => {
    const rows: AdoptionRow[] = [
      { stage: "structure", edit_distance: 2, edited_payload: null },
      { stage: "structure", edit_distance: 0, edited_payload: { y: 2 } }, // payload로 수정
    ];
    const r = computeAdoptionSignal(rows);
    // edit_distance 수치 행: 2와 0 → 평균 1
    expect(r["structure"]).toEqual({ n: 2, adoptedAsIs: 0, adoptionRate: 0, avgEditDistance: 1 });
  });

  it("빈 입력 → 빈 결과(throw 금지, n=0 안전)", () => {
    expect(computeAdoptionSignal([])).toEqual({});
  });
});
