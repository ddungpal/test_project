// 훅이 썸네일 카피 계약(Step 0) 단위 테스트 — 스키마 강제·유사도 가드·toCandidates 배선.
//   순수(DB·LLM 무관). 픽스처 재녹화 없이 계약만 못박는다.
import { describe, it, expect } from "vitest";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";
import { HOOK_MAKER_SCHEMA } from "../src/agents/hook_maker/schema.js";
import { maxReferenceSimilarity, REFERENCE_SIMILARITY_FLAG } from "../src/agents/hook_maker/referenceGuard.js";
import { hookStageSpec } from "../src/agents/hook_maker/stage.js";

// 신규 구조 후보 한 개(main·boxes 정확히 2개)를 만든다. mainCount/boxCount로 위반 케이스 생성.
function candidate(mainCount = 2, boxCount = 2) {
  return {
    title: "통장에 300만 원 묵혀두면 손해입니다",
    thumbnail_layout: "검정 배경, 중앙 노랑 메인문구 2줄.",
    thumbnail_main: Array.from({ length: mainCount }, (_, i) => `메인${i + 1}`),
    thumbnail_boxes: Array.from({ length: boxCount }, (_, i) => `박스${i + 1}`),
    reason: "손익 앵글로 차별화.",
    evidence_ids: ["ref:paking-001"],
  };
}
const raw = (cands: unknown[]) => JSON.stringify({ candidates: cands });

describe("HOOK_MAKER_SCHEMA — main/boxes 정확히 2개 강제", () => {
  it("main·boxes 2개면 통과", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(2, 2), candidate(2, 2), candidate(2, 2)]))).not.toThrow();
  });
  it("main 1개면 거부", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(1, 2), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("main 3개면 거부", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(3, 2), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("boxes 1개면 거부", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(2, 1), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("boxes 3개면 거부", () => {
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([candidate(2, 3), candidate(2, 2), candidate(2, 2)]))).toThrow(SchemaValidationError);
  });
  it("레거시 thumbnail_copy(문자열)는 신규 스키마에서 거부", () => {
    const legacy = { title: "x", thumbnail_layout: "y", thumbnail_copy: "z", reason: "r", evidence_ids: ["ref:1"] };
    expect(() => parseAndValidate("hook_maker", HOOK_MAKER_SCHEMA, raw([legacy, legacy, legacy]))).toThrow(SchemaValidationError);
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

describe("hookStageSpec.toCandidates — main/boxes 보존 + thumbnail_copy 파생 + ref_similarity", () => {
  const out = { candidates: [candidate(2, 2)] };

  it("input(reference_titles) 있을 때: main/boxes 보존·copy 파생·ref_similarity 계산", () => {
    const input = { reference_titles: [{ id: "ref:1", text: "통장에 300만 원 묵혀두면 손해입니다" }] };
    const cands = hookStageSpec("run-x").toCandidates(out as any, input);
    const p = cands[0]!.payload as any;
    expect(p.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(p.thumbnail_boxes).toEqual(["박스1", "박스2"]);
    expect(p.thumbnail_copy).toBe(["메인1", "메인2", "박스1", "박스2"].join("\n"));
    expect(typeof p.ref_similarity).toBe("number");
    expect(p.ref_similarity).toBeGreaterThanOrEqual(REFERENCE_SIMILARITY_FLAG); // title==ref
  });

  it("input 없이 호출해도 크래시 없음 — ref_similarity 0", () => {
    const cands = hookStageSpec("run-x").toCandidates(out as any);
    const p = cands[0]!.payload as any;
    expect(p.thumbnail_main).toEqual(["메인1", "메인2"]);
    expect(p.thumbnail_copy).toBe(["메인1", "메인2", "박스1", "박스2"].join("\n"));
    expect(p.ref_similarity).toBe(0);
  });
});
