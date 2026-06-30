// 저장→읽기 round-trip(script-format-model step1).
//   저장 경로(scriptCell)와 읽기 경로(scriptView)가 동일한 normalizeSegmentPayload를 단일 출처로 통과시키므로,
//   "정상 payload를 정규화한 출력을 다시 정규화해도 동일(멱등)"이면 DB를 거쳐도 형태가 보존됨이 보장된다.
//   깨진 payload는 양쪽 모두 prose로 폴백 — 화면에 박제 방지.

import { describe, expect, it } from "vitest";
import { normalizeSegmentPayload } from "../src/pipeline/segmentBlock.js";

// 저장(scriptCell)→DB→읽기(scriptView)를 normalize 멱등으로 시뮬레이트.
function roundTrip(kind: string | undefined | null, payload: unknown) {
  const stored = normalizeSegmentPayload(kind, payload); // 저장 시 정규화
  const read = normalizeSegmentPayload(stored.kind, stored.payload); // 읽기 시 재정규화
  return { stored, read };
}

describe("scriptView round-trip (저장→읽기 normalize 멱등)", () => {
  it("table 정상 — 저장·읽기 동일", () => {
    const { stored, read } = roundTrip("table", {
      columns: ["항목", "금액"],
      rows: [["세금", "10만원"], ["수익", "5만원"]],
      caption: "표 설명",
    });
    expect(stored).toEqual({
      kind: "table",
      payload: { columns: ["항목", "금액"], rows: [["세금", "10만원"], ["수익", "5만원"]], caption: "표 설명" },
    });
    expect(read).toEqual(stored);
  });

  it("case 정상 — 저장·읽기 동일", () => {
    const { stored, read } = roundTrip("case", {
      intro: "상황별로 보면",
      branches: [
        { condition: "연봉 5천 이하", outcome: "공제 유리" },
        { condition: "연봉 1억 이상", outcome: "한도 초과" },
      ],
    });
    expect(stored).toEqual({
      kind: "case",
      payload: {
        intro: "상황별로 보면",
        branches: [
          { condition: "연봉 5천 이하", outcome: "공제 유리" },
          { condition: "연봉 1억 이상", outcome: "한도 초과" },
        ],
      },
    });
    expect(read).toEqual(stored);
  });

  it("visual 정상 — 저장·읽기 동일", () => {
    const { stored, read } = roundTrip("visual", { cue: "그래프 줌인", note: "빨강 강조" });
    expect(stored).toEqual({ kind: "visual", payload: { cue: "그래프 줌인", note: "빨강 강조" } });
    expect(read).toEqual(stored);
  });

  it("깨진 payload — 양쪽 모두 prose 폴백", () => {
    const { stored, read } = roundTrip("table", { columns: ["a"] }); // rows 누락
    expect(stored).toEqual({ kind: "prose", payload: null });
    expect(read).toEqual({ kind: "prose", payload: null });
  });
});
