// 썸네일 스타일 추출(style_extractor) 단위 테스트 — 순수 검증만(DB·LLM 무관).
//   라이브는 scripts/extract-style.ts. 검증: ① 스키마 형태 + required에 빈배열 가능 필드 없음,
//   ② prep 헬퍼(buildStyleInput)가 라벨 빈 편/채운 편 모두 안전 처리.
import { describe, it, expect } from "vitest";
import { STYLE_EXTRACTION_SCHEMA } from "../src/agents/style_extractor/schema.js";
import { buildStyleInput, type ThumbnailEdition, type LabelEdition } from "../scripts/extract-style.js";

type SchemaNode = {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
};

describe("STYLE_EXTRACTION_SCHEMA 형태", () => {
  const root = STYLE_EXTRACTION_SCHEMA as SchemaNode;

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

  it("배열 필드(hook_patterns·emphasis_words·layout_archetypes·devices·banned)는 required에 없다", () => {
    const patterns = root.properties?.patterns;
    const copy = patterns?.properties?.copy;
    const visual = patterns?.properties?.visual;
    expect(copy?.required ?? []).not.toContain("hook_patterns");
    expect(copy?.required ?? []).not.toContain("emphasis_words");
    expect(visual?.required ?? []).not.toContain("layout_archetypes");
    expect(visual?.required ?? []).not.toContain("devices");
    expect(patterns?.required ?? []).not.toContain("banned");
  });
});

describe("buildStyleInput (prep 순수 헬퍼)", () => {
  const editions: ThumbnailEdition[] = [
    { edition_id: "ed-1", topic: "슈퍼 ISA", copy: ["연봉 7500이하 꼭 보세요"] },
    { edition_id: "ed-2", topic: "파킹통장", copy: ["매달 돈 주는 통장"] },
  ];

  it("라벨이 채워진 편은 visual 값을 그대로 전달한다", () => {
    const labels: LabelEdition[] = [
      { edition_id: "ed-1", visual: { face: "정면 클로즈업", layout: "2분할", color: "검정+노랑" } },
    ];
    const out = buildStyleInput(editions, labels);
    expect(out).toHaveLength(2);
    expect(out[0]?.topic).toBe("슈퍼 ISA");
    expect(out[0]?.copy).toEqual(["연봉 7500이하 꼭 보세요"]);
    expect(out[0]?.visual.face).toBe("정면 클로즈업");
    expect(out[0]?.visual.color).toBe("검정+노랑");
    // 누락된 키도 빈 문자열로 안전 채움.
    expect(out[0]?.visual.number_treatment).toBe("");
    expect(out[0]?.visual.devices).toBe("");
  });

  it("라벨 없는 편은 빈 visual 구조로 안전 처리(깨지지 않음)", () => {
    const out = buildStyleInput(editions, []); // 라벨 0개
    expect(out).toHaveLength(2);
    for (const e of out) {
      expect(Object.keys(e.visual).sort()).toEqual(
        ["color", "devices", "emphasis", "face", "layout", "notes", "number_treatment"].sort(),
      );
      expect(Object.values(e.visual).every((v) => v === "")).toBe(true);
    }
  });

  it("visual이 전부 빈 문자열인 라벨(현재 골든 파일 상태)도 안전 처리", () => {
    const labels: LabelEdition[] = [
      { edition_id: "ed-2", visual: { face: "", layout: "", emphasis: "", color: "", number_treatment: "", devices: "", notes: "" } },
    ];
    const out = buildStyleInput(editions, labels);
    const ed2 = out.find((e) => e.topic === "파킹통장");
    expect(ed2?.visual.face).toBe("");
    expect(ed2?.copy).toEqual(["매달 돈 주는 통장"]);
  });
});
