// 짠펜 형식 블록 emit(P2 outline-format step1) — 순수 스키마 검증 + P1 normalize 연결.
//   검증: ① SCRIBE_SCHEMA가 kind:"table"/"case" 블록 segment 통과,
//        ② 기존 prose segment(kind/payload 없음)도 통과(하위호환 — 핵심),
//        ③ end-to-end: 블록 형태 scribe 출력을 normalizeSegmentPayload에 통과시키면 기대 kind/payload,
//           깨진 payload는 prose로 폴백(P1 함수 재사용).
import { describe, it, expect } from "vitest";
import { SCRIBE_SCHEMA, type ScribeOutput } from "../src/agents/scribe/schema.js";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { normalizeSegmentPayload } from "../src/pipeline/segmentBlock.js";

// 유효 출력 1개를 만든다(minItems 3 충족). segments로 갈아끼운다.
function output(segments: Array<Record<string, unknown>>) {
  return { segments };
}

const proseSeg = (ord: number) => ({
  ord,
  text: "짠하! 오늘은 연금저축 이야기예요.",
  used_fact_idxs: [],
  used_asset_idxs: [],
});

describe("SCRIBE_SCHEMA — 형식 블록 segment", () => {
  it("kind:\"table\" + payload(columns/rows) 통과", () => {
    const json = JSON.stringify(
      output([
        proseSeg(0),
        {
          ord: 1,
          text: "두 상품을 표로 비교해볼게요.",
          used_fact_idxs: [0],
          used_asset_idxs: [],
          kind: "table",
          payload: {
            columns: ["항목", "연금저축", "IRP"],
            rows: [["세액공제 한도", "600만원", "900만원"]],
            caption: "한도 비교",
          },
        },
        proseSeg(2),
      ]),
    );
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).not.toThrow();
  });

  it("kind:\"case\" + payload(branches) 통과", () => {
    const json = JSON.stringify(
      output([
        proseSeg(0),
        {
          ord: 1,
          text: "상황별로 갈려요.",
          used_fact_idxs: [],
          used_asset_idxs: [],
          kind: "case",
          payload: {
            intro: "이런 분은 이렇게요",
            branches: [
              { condition: "사회초년생", outcome: "연금저축부터" },
              { condition: "고소득자", outcome: "IRP 한도까지" },
            ],
          },
        },
        proseSeg(2),
      ]),
    );
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).not.toThrow();
  });

  it("기존 prose segment(kind/payload 없음)도 통과한다(하위호환 — 핵심 케이스)", () => {
    const json = JSON.stringify(output([proseSeg(0), proseSeg(1), proseSeg(2)]));
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).not.toThrow();
  });

  it("payload는 loose object — 추가 필드(stray)가 섞여도 스키마는 통과한다", () => {
    const json = JSON.stringify(
      output([
        proseSeg(0),
        {
          ord: 1,
          text: "표예요.",
          used_fact_idxs: [],
          used_asset_idxs: [],
          kind: "table",
          payload: { columns: ["a"], rows: [["1"]], junk: "버려질 필드", style: {} },
        },
        proseSeg(2),
      ]),
    );
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).not.toThrow();
  });

  it("잘못된 kind 값(예: chart)은 거부한다", () => {
    const json = JSON.stringify(
      output([
        proseSeg(0),
        { ord: 1, text: "x", used_fact_idxs: [], used_asset_idxs: [], kind: "chart", payload: {} },
        proseSeg(2),
      ]),
    );
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).toThrow(SchemaValidationError);
  });

  it("payload가 object가 아니면(예: 문자열) 거부한다", () => {
    const json = JSON.stringify(
      output([
        proseSeg(0),
        { ord: 1, text: "x", used_fact_idxs: [], used_asset_idxs: [], kind: "table", payload: "nope" },
        proseSeg(2),
      ]),
    );
    expect(() => parseAndValidate("scribe", SCRIBE_SCHEMA, json)).toThrow(SchemaValidationError);
  });
});

describe("SCRIBE_SCHEMA → normalizeSegmentPayload (end-to-end 못박기)", () => {
  it("스키마 통과한 블록 출력을 normalize하면 기대 kind/payload가 나온다", () => {
    const segments = [
      {
        ord: 0,
        text: "표예요.",
        used_fact_idxs: [],
        used_asset_idxs: [],
        kind: "table",
        payload: { columns: ["항목", "값"], rows: [["세금", "10만원"]] },
      },
      {
        ord: 1,
        text: "분기예요.",
        used_fact_idxs: [],
        used_asset_idxs: [],
        kind: "case",
        payload: { branches: [{ condition: "c", outcome: "o" }] },
      },
      proseSeg(2),
    ];
    const json = JSON.stringify(output(segments));
    // 스키마 검증 통과 후 그 데이터를 그대로 normalize에 흘린다(파이프라인 scriptCell 경로 재현).
    const [s0, s1, s2] = parseAndValidate<ScribeOutput>("scribe", SCRIBE_SCHEMA, json).segments;

    const table = normalizeSegmentPayload(s0!.kind, s0!.payload);
    expect(table).toEqual({ kind: "table", payload: { columns: ["항목", "값"], rows: [["세금", "10만원"]] } });

    const cas = normalizeSegmentPayload(s1!.kind, s1!.payload);
    expect(cas).toEqual({ kind: "case", payload: { branches: [{ condition: "c", outcome: "o" }] } });

    // kind/payload 없는 prose → prose, payload null.
    const prose = normalizeSegmentPayload(s2!.kind, s2!.payload);
    expect(prose).toEqual({ kind: "prose", payload: null });
  });

  it("스키마는 통과하나 payload 형태가 깨진 블록은 normalize에서 prose로 폴백한다", () => {
    // kind:"table"이지만 rows 누락 → 스키마는 loose라 통과, normalize가 안전하게 prose로 떨어뜨림.
    const segments = [
      {
        ord: 0,
        text: "깨진 표.",
        used_fact_idxs: [],
        used_asset_idxs: [],
        kind: "table",
        payload: { columns: ["a"] },
      },
      proseSeg(1),
      proseSeg(2),
    ];
    const json = JSON.stringify(output(segments));
    const [s0] = parseAndValidate<ScribeOutput>("scribe", SCRIBE_SCHEMA, json).segments;
    const out = normalizeSegmentPayload(s0!.kind, s0!.payload);
    expect(out).toEqual({ kind: "prose", payload: null });
  });
});
