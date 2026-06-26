// 썸네일메이커 계약 단위 테스트 — 스키마 강제(main2/boxes2·후보3)·toCandidates 배선.
//   ★ referenceGuard·styleConformance는 hook_maker 것을 재사용 — 여기선 thumbnail_maker stage가 그걸 올바로 부착하는지만 본다.
//   순수(DB·LLM 무관). 픽스처 재녹화 없이 계약만 못박는다.
import { describe, it, expect } from "vitest";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { THUMBNAIL_MAKER_SCHEMA } from "../src/agents/thumbnail_maker/schema.js";
import { thumbnailStageSpec } from "../src/agents/thumbnail_maker/stage.js";
import { REFERENCE_SIMILARITY_FLAG } from "../src/agents/hook_maker/referenceGuard.js";

// 썸네일 후보 한 개(main·boxes 정확히 2개). mainCount/boxCount로 위반 케이스 생성.
function candidate(mainCount = 2, boxCount = 2) {
  return {
    thumbnail_layout: "검정 배경, 중앙 노랑 메인문구 2줄.",
    thumbnail_main: Array.from({ length: mainCount }, (_, i) => `메인${i + 1}`),
    thumbnail_boxes: Array.from({ length: boxCount }, (_, i) => `박스${i + 1}`),
    reason: "손익 앵글로 차별화.",
    evidence_ids: ["ref:paking-001"],
  };
}
const raw = (cands: unknown[]) => JSON.stringify({ candidates: cands });

describe("THUMBNAIL_MAKER_SCHEMA — main/boxes 정확히 2개·후보 정확히 3개", () => {
  it("main·boxes 2개, 후보 3개면 통과", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(2, 2), candidate(2, 2), candidate(2, 2)]))).not.toThrow();
  });
  it("main 1개면 거부", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(1, 2), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("main 3개면 거부", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(3, 2), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("boxes 1개면 거부", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(2, 1), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("boxes 3개면 거부", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(2, 3), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("후보 2개면 거부(minItems 3)", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("후보 4개면 거부(maxItems 3)", () => {
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([candidate(2, 2), candidate(2, 2), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("title 필드(제목)는 additionalProperties:false로 거부 — 썸네일 단계는 제목을 생성하지 않음", () => {
    const withTitle = { ...candidate(2, 2), title: "제목" };
    expect(() => parseAndValidate("thumbnail_maker", THUMBNAIL_MAKER_SCHEMA, raw([withTitle, candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
});

describe("thumbnailStageSpec.toCandidates — main/boxes 보존 + thumbnail_copy 파생 + ref_similarity/style_conformance 부착", () => {
  const out = { candidates: [candidate(2, 2), candidate(2, 2), candidate(2, 2)] };

  it("input(reference_thumbnail_copies) 있을 때: main/boxes 보존·copy 파생·ref_similarity·style_conformance 계산", () => {
    const input = { reference_thumbnail_copies: [{ id: "ref:1", text: "메인1 메인2" }] };
    const cands = thumbnailStageSpec("run-x").toCandidates(out as any, input);
    const p = cands[0]!.payload as any;
    expect(p.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(p.thumbnail_boxes).toEqual(["박스1", "박스2"]);
    expect(p.thumbnail_layout).toBe("검정 배경, 중앙 노랑 메인문구 2줄.");
    expect(p.thumbnail_copy).toBe(["메인1", "메인2", "박스1", "박스2"].join("\n"));
    expect(typeof p.ref_similarity).toBe("number");
    expect(p.ref_similarity).toBeGreaterThanOrEqual(REFERENCE_SIMILARITY_FLAG); // main join == ref
    // style_conformance 주석(중립이라도 형태 존재) — banned_hits 배열·winning_score 숫자.
    expect(Array.isArray(p.style_conformance.banned_hits)).toBe(true);
    expect(typeof p.style_conformance.winning_score).toBe("number");
  });

  it("input 없이 호출해도 크래시 없음 — ref_similarity 0·copy 파생", () => {
    const cands = thumbnailStageSpec("run-x").toCandidates(out as any);
    const p = cands[0]!.payload as any;
    expect(p.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(p.thumbnail_copy).toBe(["메인1", "메인2", "박스1", "박스2"].join("\n"));
    expect(p.ref_similarity).toBe(0);
  });

  it("후보 3개 전부 매핑된다", () => {
    const cands = thumbnailStageSpec("run-x").toCandidates(out as any);
    expect(cands.length).toBe(3);
    expect(cands.map((c) => c.idx)).toEqual([0, 1, 2]);
  });

  it("topic_missing 주석 부착 — 메인문구에 주제 키워드 없으면 missing:true", () => {
    const input = { topic: "레버리지 ETF", selected_title: "레버리지 ETF 사도 될까" };
    const cands = thumbnailStageSpec("run-x").toCandidates(out as any, input);
    const p = cands[0]!.payload as any;
    // candidate()의 main은 ["메인1","메인2"]라 주제 키워드 없음 → missing:true.
    expect(p.topic_missing.missing).toBe(true);
    expect(typeof p.topic_missing.keyword).toBe("string");
  });

  it("topic_missing 주석 부착 — 메인문구에 주제 키워드 있으면 missing:false", () => {
    const withKw = {
      candidates: [
        { ...candidate(2, 2), thumbnail_main: ["레버리지 ETF 위험할까", "초보는 주의"] },
        candidate(2, 2),
        candidate(2, 2),
      ],
    };
    const input = { topic: "레버리지 ETF", selected_title: "레버리지 ETF 사도 될까" };
    const cands = thumbnailStageSpec("run-x").toCandidates(withKw as any, input);
    const p = cands[0]!.payload as any;
    expect(p.topic_missing.missing).toBe(false);
  });

  it("input 없으면 topic_missing 중립(크래시 없음) — 표시 전용 안전", () => {
    const cands = thumbnailStageSpec("run-x").toCandidates(out as any);
    const p = cands[0]!.payload as any;
    expect(p.topic_missing).toEqual({ missing: false, keyword: null });
  });
});
