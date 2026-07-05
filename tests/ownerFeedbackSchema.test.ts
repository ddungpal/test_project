// owner_feedback_extractor 스키마 회귀 — 빈 배열이 될 수 있는 rules 가 required 에 없는지(과거 critic 사건).
//   forced tool_use 도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → api 무재시도서 전체 실패.
//   따라서 rules 는 절대 required 금지. change_note 만 필수. analogyExtractorSchema.test.ts 미러.
import { describe, it, expect } from "vitest";
import { OWNER_FEEDBACK_SCHEMA } from "../src/agents/owner_feedback/schema.js";

describe("OWNER_FEEDBACK_SCHEMA (빈배열 required 회귀)", () => {
  type Prop = { type: string; items?: unknown; enum?: string[] };
  const schema = OWNER_FEEDBACK_SCHEMA as {
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

  it("rules(빈 가능 string[])는 required 에 없다(critic 사건 회귀)", () => {
    expect(schema.required ?? []).not.toContain("rules");
  });

  it("change_note 만 required(문자열 — 항상 채움)", () => {
    expect(schema.required).toEqual(["change_note"]);
    expect(prop("change_note").type).toBe("string");
  });

  it("rules 는 string[] 형태로 properties 에 등재(additionalProperties:false 통과용)", () => {
    const p = prop("rules");
    expect(p.type).toBe("array");
    expect(p.items).toEqual({ type: "string" });
  });
});
