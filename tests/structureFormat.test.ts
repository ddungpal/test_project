// outline format 신호(P2) 단위 테스트 — 순수 스키마 검증만(DB·LLM 무관).
//   검증: ① format 있는 outline(table/case/explain) 통과, ② format 없는 outline 통과(하위호환 핵심),
//        ③ 잘못된 format 값 거부, ④ SectionFormat/OutlineSection 타입 export 확인.
import { describe, it, expect } from "vitest";
import {
  STRUCTURER_SCHEMA,
  type OutlineSection,
  type SectionFormat,
} from "../src/agents/structurer/schema.js";
import { parseAndValidate, SchemaValidationError } from "../src/llm/schema.js";

// format을 제외한 유효 후보 1개를 만든다. sections로 outline을 갈아끼운다.
function candidate(outline: Array<Record<string, unknown>>) {
  return {
    candidates: [
      {
        approach: "사례→원리",
        outline,
        reason: "이해 흐름상 사례를 먼저 보여주면 편안하다.",
        evidence_ids: ["topic:1"],
      },
      {
        approach: "공포→해소",
        outline,
        reason: "불안을 먼저 짚고 안심시킨다.",
        evidence_ids: ["title:1"],
      },
    ],
  };
}

const baseSection = { section: "오프닝", goal: "공감 유도", why: "쉬운 것 먼저" };

describe("STRUCTURER_SCHEMA — outline format 신호", () => {
  it("format 있는 outline(table/case/explain)은 통과한다", () => {
    const formats: SectionFormat[] = ["table", "case", "explain"];
    for (const format of formats) {
      const json = JSON.stringify(
        candidate([
          { ...baseSection, format },
          { section: "본론", goal: "비교", why: "축이 분명", format: "table" },
          { section: "마무리", goal: "정리", why: "행동 유도" },
        ]),
      );
      expect(() => parseAndValidate("구다리", STRUCTURER_SCHEMA, json)).not.toThrow();
    }
  });

  it("format 없는 outline도 통과한다(하위호환 — 핵심 케이스)", () => {
    const json = JSON.stringify(
      candidate([
        { ...baseSection },
        { section: "본론", goal: "설명", why: "맥락 제공" },
        { section: "마무리", goal: "정리", why: "행동 유도" },
      ]),
    );
    expect(() => parseAndValidate("구다리", STRUCTURER_SCHEMA, json)).not.toThrow();
  });

  it("잘못된 format 값(예: chart)은 거부한다", () => {
    const json = JSON.stringify(
      candidate([
        { ...baseSection, format: "chart" },
        { section: "본론", goal: "설명", why: "맥락" },
        { section: "마무리", goal: "정리", why: "행동" },
      ]),
    );
    expect(() => parseAndValidate("구다리", STRUCTURER_SCHEMA, json)).toThrow(SchemaValidationError);
  });

  it("SectionFormat / OutlineSection 타입이 export된다", () => {
    // 컴파일 타임 검증: 타입이 import돼 사용되면 typecheck가 보장한다.
    const fmt: SectionFormat = "case";
    const sec: OutlineSection = { section: "s", goal: "g", why: "w", format: fmt };
    expect(sec.format).toBe("case");
    // format 생략도 타입상 유효(optional).
    const noFmt: OutlineSection = { section: "s", goal: "g", why: "w" };
    expect(noFmt.format).toBeUndefined();
  });
});
