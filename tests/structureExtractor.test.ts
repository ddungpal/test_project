// 구성 추출(structure_extractor) 단위 테스트 — 순수 검증만(DB·LLM 무관).
//   라이브는 scripts/extract-structure-style.ts. 검증: ① 스키마 형태 + required에 빈배열 가능 필드 없음,
//   ② fold 헬퍼(foldStructureStrayFields)가 top-level stray 필드를 patterns 안으로 흡수.
import { describe, it, expect } from "vitest";
import { STRUCTURE_STYLE_SCHEMA, type StructureExtractionOutput } from "../src/agents/structure_extractor/schema.js";
import { foldStructureStrayFields, normalizeStructurePatterns } from "../scripts/extract-structure-style.js";

type SchemaNode = {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
};

describe("STRUCTURE_STYLE_SCHEMA 형태", () => {
  const root = STRUCTURE_STYLE_SCHEMA as SchemaNode;

  it("루트는 닫힌 object이고 patterns·evidence_summary를 가진다", () => {
    expect(root.type).toBe("object");
    expect(root.additionalProperties).toBe(false);
    expect(root.properties?.patterns).toBeDefined();
    expect(root.properties?.evidence_summary).toBeDefined();
    expect(root.required).toContain("patterns");
    expect(root.required).toContain("evidence_summary");
  });

  it("required에 들어간 모든 필드는 array 타입이 아니다(빈배열 누락 사고 방지)", () => {
    // 모든 object 노드를 순회하며 required로 선언된 프로퍼티의 type이 array가 아님을 보장.
    function walk(node: SchemaNode, path: string) {
      if (node.type === "object" && node.properties) {
        for (const reqKey of node.required ?? []) {
          const child = node.properties[reqKey];
          expect(child, `${path}.${reqKey} 가 properties에 없음`).toBeDefined();
          expect(child?.type, `${path}.${reqKey} 는 array면 안 됨(required에서 빼라)`).not.toBe("array");
        }
        for (const [k, child] of Object.entries(node.properties)) {
          walk(child, `${path}.${k}`);
        }
      }
    }
    walk(root, "$");
  });

  it("배열 필드(section_archetypes·flow_principles·banned)·confidence·tentative_notes는 required에 없다", () => {
    const patterns = root.properties?.patterns;
    expect(patterns?.required ?? []).not.toContain("section_archetypes");
    expect(patterns?.required ?? []).not.toContain("flow_principles");
    expect(patterns?.required ?? []).not.toContain("banned");
    expect(patterns?.required ?? []).not.toContain("confidence");
    expect(patterns?.required ?? []).not.toContain("tentative_notes");
  });

  it("top-level 거울 필드(banned·confidence·tentative_notes)가 등재돼 있다(claude-p stray 방어)", () => {
    expect(root.properties?.banned).toBeDefined();
    expect(root.properties?.confidence).toBeDefined();
    expect(root.properties?.tentative_notes).toBeDefined();
  });

  it("reference_outlines가 patterns·top-level 양쪽에 등재되고 required엔 없다(옵셔널)", () => {
    const patterns = root.properties?.patterns;
    expect(patterns?.properties?.reference_outlines).toBeDefined();
    expect(patterns?.properties?.reference_outlines?.type).toBe("array");
    expect(patterns?.required ?? []).not.toContain("reference_outlines"); // 옵셔널 — 없어도 1단계 동작 보존.
    expect(root.properties?.reference_outlines).toBeDefined(); // top-level 거울(claude-p stray 방어).
    expect(root.required ?? []).not.toContain("reference_outlines");
  });

  it("reference_outlines 항목 스키마는 topic만 required·section만 required로 닫혀 있다", () => {
    const item = root.properties?.patterns?.properties?.reference_outlines?.items;
    expect(item?.additionalProperties).toBe(false);
    expect(item?.required).toEqual(["topic"]); // outline은 빈 가능 → required 제외.
    const outlineItem = item?.properties?.outline?.items;
    expect(outlineItem?.additionalProperties).toBe(false);
    expect(outlineItem?.required).toEqual(["section"]); // note는 옵셔널.
  });
});

describe("foldStructureStrayFields (stray 흡수 순수 헬퍼)", () => {
  const basePatterns = {
    section_archetypes: ["공감형 오프닝"],
    flow_principles: ["쉬운 것 먼저"],
    hook_placement: "맨 앞에 공감 질문",
    anxiety_relief: "중반에 안심",
    misconception_handling: "오해 먼저 깸",
    ordering_notes: "공감→정보→실행",
  };

  it("top-level로 토한 banned/confidence/tentative_notes를 patterns 안으로 접는다", () => {
    // patterns엔 banned 등 stray 필드 없음(claude-p가 top-level로 토한 형태). 그래서 단언으로 느슨하게 둔다.
    const out = foldStructureStrayFields({
      patterns: { ...basePatterns },
      evidence_summary: "근거",
      banned: ["사색적 잔잔한 톤"],
      confidence: "tentative",
      tentative_notes: ["표본 3편"],
    } as StructureExtractionOutput);
    expect(out.banned).toEqual(["사색적 잔잔한 톤"]);
    expect(out.confidence).toBe("tentative");
    expect(out.tentative_notes).toEqual(["표본 3편"]);
  });

  it("patterns 내부에 값이 있으면 그쪽을 우선한다(이중 출력 방어)", () => {
    const out = foldStructureStrayFields({
      patterns: { ...basePatterns, banned: ["내부값"], confidence: "high" },
      evidence_summary: "근거",
      banned: ["top-level값"], // 무시돼야 함
      confidence: "tentative", // 무시돼야 함
    });
    expect(out.banned).toEqual(["내부값"]);
    expect(out.confidence).toBe("high");
  });

  it("stray 필드가 어디에도 없으면 키 자체가 생기지 않는다(exactOptional 준수)", () => {
    const out = foldStructureStrayFields({
      patterns: { ...basePatterns },
      evidence_summary: "근거",
    } as StructureExtractionOutput);
    expect("banned" in out).toBe(false);
    expect("confidence" in out).toBe(false);
    expect("tentative_notes" in out).toBe(false);
  });

  it("top-level로 토한 reference_outlines를 patterns 안으로 접는다", () => {
    const out = foldStructureStrayFields({
      patterns: { ...basePatterns },
      evidence_summary: "근거",
      reference_outlines: [{ topic: "비상금", outline: [{ section: "오프닝" }] }],
    } as StructureExtractionOutput);
    expect(out.reference_outlines).toEqual([{ topic: "비상금", outline: [{ section: "오프닝" }] }]);
  });
});

describe("normalizeStructurePatterns — reference_outlines 방어", () => {
  const basePatterns = {
    section_archetypes: ["공감형 오프닝"],
    flow_principles: ["쉬운 것 먼저"],
    hook_placement: "맨 앞에 공감 질문",
    anxiety_relief: "중반에 안심",
    misconception_handling: "오해 먼저 깸",
    ordering_notes: "공감→정보→실행",
    banned: [],
  };

  it("cap 6을 적용한다(7편 들어오면 6편만)", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      topic: `편${i}`,
      outline: [{ section: "오프닝" }],
    }));
    const out = normalizeStructurePatterns({ ...basePatterns, reference_outlines: many });
    expect(out.reference_outlines).toHaveLength(6);
  });

  it("빈 topic·빈 outline·section 없는 항목을 폐기한다", () => {
    const out = normalizeStructurePatterns({
      ...basePatterns,
      reference_outlines: [
        { topic: "", outline: [{ section: "오프닝" }] }, // 빈 topic → 폐기
        { topic: "빈목차", outline: [] }, // 빈 outline → 폐기
        { topic: "유효", outline: [{ section: "" }, { section: "본론" }] }, // 빈 section 제거 후 1개 남음
      ],
    });
    expect(out.reference_outlines).toEqual([{ topic: "유효", outline: [{ section: "본론" }] }]);
  });

  it("note는 있을 때만 키로 포함된다(빈 note는 제거)", () => {
    const out = normalizeStructurePatterns({
      ...basePatterns,
      reference_outlines: [
        { topic: "주제", outline: [{ section: "오프닝", note: "공감" }, { section: "본론", note: "" }] },
      ],
    });
    const outline = out.reference_outlines?.[0]?.outline;
    expect(outline?.[0]).toEqual({ section: "오프닝", note: "공감" });
    expect("note" in (outline?.[1] ?? {})).toBe(false);
  });

  it("reference_outlines가 없거나 전부 폐기되면 키 자체가 생기지 않는다(exactOptional)", () => {
    const none = normalizeStructurePatterns({ ...basePatterns });
    expect("reference_outlines" in none).toBe(false);
    const allEmpty = normalizeStructurePatterns({
      ...basePatterns,
      reference_outlines: [{ topic: "", outline: [] }],
    });
    expect("reference_outlines" in allEmpty).toBe(false);
  });
});
