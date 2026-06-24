// 훅이 제목 계약(제목 전용) 단위 테스트 — 스키마 강제·유사도 가드·toCandidates 배선.
//   ★ 썸네일 계약은 thumbnail_maker로 이동(thumbnailMakerContract.test.ts). 여기선 제목 전용 계약만 못박는다.
//   순수(DB·LLM 무관). 픽스처 재녹화 없이 계약만 못박는다.
import { describe, it, expect } from "vitest";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { HOOK_MAKER_SCHEMA } from "../src/agents/hook_maker/schema.js";
import { maxReferenceSimilarity, REFERENCE_SIMILARITY_FLAG } from "../src/agents/hook_maker/referenceGuard.js";
import { hookStageSpec } from "../src/agents/hook_maker/stage.js";

// 제목 후보 한 개(title/reason/evidence만).
function candidate(title = "통장에 300만 원 묵혀두면 손해입니다") {
  return { title, reason: "손익 앵글로 차별화.", evidence_ids: ["ref:paking-001"] };
}
const raw = (cands: unknown[]) => JSON.stringify({ candidates: cands });

describe("HOOK_MAKER_SCHEMA — 제목 전용, 후보 정확히 3개", () => {
  it("title·reason·evidence 3개면 통과", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(), candidate(), candidate()]))).not.toThrow();
  });
  it("후보 2개면 거부(minItems 3)", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(), candidate()]))).toThrow(SchemaValidationError);
  });
  it("후보 4개면 거부(maxItems 3)", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(), candidate(), candidate(), candidate()]))).toThrow(SchemaValidationError);
  });
  it("title 비면 거부", () => {
    const bad = { title: "", reason: "r", evidence_ids: ["ref:1"] };
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([bad, candidate(), candidate()]))).toThrow(SchemaValidationError);
  });
  it("evidence_ids 비면 거부(minItems 1)", () => {
    const bad = { title: "x", reason: "r", evidence_ids: [] };
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([bad, candidate(), candidate()]))).toThrow(SchemaValidationError);
  });
  it("썸네일 필드(thumbnail_main 등)는 additionalProperties:false로 거부", () => {
    const withThumb = { title: "x", reason: "r", evidence_ids: ["ref:1"], thumbnail_main: ["a", "b"] };
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([withThumb, candidate(), candidate()]))).toThrow(SchemaValidationError);
  });
});

describe("maxReferenceSimilarity — containment 재사용", () => {
  const refs = ["통장에 300만 원 묵혀두면 손해입니다 파킹통장 추천", "비상금 그냥 두지 마세요"];
  it("레퍼런스와 동일 문자열이면 ≥ flag(거의 1)", () => {
    expect(maxReferenceSimilarity(refs[0]!, refs)).toBeGreaterThanOrEqual(REFERENCE_SIMILARITY_FLAG);
  });
  it("재구성된 다른 표현이면 낮음(< flag)", () => {
    expect(maxReferenceSimilarity("잠자는 비상금 깨우는 가장 빠른 방법", refs)).toBeLessThan(REFERENCE_SIMILARITY_FLAG);
  });
  it("references 빈 배열이면 0", () => {
    expect(maxReferenceSimilarity("아무 제목이나", [])).toBe(0);
  });
});

describe("hookStageSpec.toCandidates — title + ref_similarity만(썸네일 필드 없음)", () => {
  const out = { candidates: [candidate("통장에 300만 원 묵혀두면 손해입니다")] };

  it("input(reference_titles) 있을 때: title 보존·ref_similarity 계산·썸네일 필드 없음", () => {
    const input = { reference_titles: [{ id: "ref:1", text: "통장에 300만 원 묵혀두면 손해입니다" }] };
    const cands = hookStageSpec("run-x").toCandidates(out as any, input);
    const p = cands[0]!.payload as any;
    expect(p.title).toBe("통장에 300만 원 묵혀두면 손해입니다");
    expect(typeof p.ref_similarity).toBe("number");
    expect(p.ref_similarity).toBeGreaterThanOrEqual(REFERENCE_SIMILARITY_FLAG); // title==ref
    expect(p.thumbnail_main).toBeUndefined();
    expect(p.thumbnail_boxes).toBeUndefined();
    expect(p.thumbnail_copy).toBeUndefined();
    expect(p.style_conformance).toBeUndefined();
  });

  it("input 없이 호출해도 크래시 없음 — ref_similarity 0", () => {
    const cands = hookStageSpec("run-x").toCandidates(out as any);
    const p = cands[0]!.payload as any;
    expect(p.title).toBe("통장에 300만 원 묵혀두면 손해입니다");
    expect(p.ref_similarity).toBe(0);
  });
});
