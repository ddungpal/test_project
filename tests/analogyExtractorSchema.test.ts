// analogy_extractor 스키마 회귀 — 빈 배열이 될 수 있는 string[] 필드가 required 에 없는지(과거 critic 사건).
//   forced tool_use 도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → api 무재시도서 전체 실패.
//   따라서 techniques·target_domains·do·banned·tentative_notes 는 절대 required 금지. distortion_guard 만 필수.
import { describe, it, expect } from "vitest";
import { ANALOGY_EXTRACTION_SCHEMA } from "../src/agents/analogy_extractor/schema.js";

describe("ANALOGY_EXTRACTION_SCHEMA (빈배열 required 회귀)", () => {
  type Prop = { type: string; items?: unknown; enum?: string[] };
  const schema = ANALOGY_EXTRACTION_SCHEMA as {
    type: string;
    required?: string[];
    additionalProperties?: boolean;
    properties: Record<string, Prop>;
  };
  const prop = (k: string): Prop => {
    const p = schema.properties[k];
    if (!p) throw new Error(`properties.${k} 미등재`);
    return p;
  };

  it("object 스키마 골격(additionalProperties:false)", () => {
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("빈 가능 string[] 필드는 required 에 없다(critic 사건 회귀)", () => {
    const required = schema.required ?? [];
    for (const emptyable of ["techniques", "target_domains", "do", "banned", "tentative_notes"]) {
      expect(required).not.toContain(emptyable);
    }
  });

  it("distortion_guard 만 required(문자열 — 항상 채움)", () => {
    expect(schema.required).toEqual(["distortion_guard"]);
    expect(prop("distortion_guard").type).toBe("string");
  });

  it("빈 가능 필드는 모두 string[] 형태로 properties 에 등재(additionalProperties:false 통과용)", () => {
    for (const f of ["techniques", "target_domains", "do", "banned", "tentative_notes"]) {
      const p = prop(f);
      expect(p.type).toBe("array");
      expect(p.items).toEqual({ type: "string" });
    }
  });

  it("confidence 는 옵셔널 enum(high|tentative), required 아님", () => {
    expect(schema.required ?? []).not.toContain("confidence");
    expect(prop("confidence").enum).toEqual(["high", "tentative"]);
  });
});
