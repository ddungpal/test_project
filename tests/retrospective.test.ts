// 회고(Phase 4 슬라이스 2) 단위 테스트 — 순수 빌더만(DB·LLM 무관). 라이브는 scripts/run-retrospective.ts.
import { describe, it, expect } from "vitest";
import { buildAbSummaries, summarizeChoicePayload } from "../src/agents/retrospectivist/prepare.js";
import { RETROSPECTIVE_SCHEMA, INSIGHT_CATEGORIES } from "../src/agents/retrospectivist/schema.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };

describe("A/B 요약(buildAbSummaries)", () => {
  it("컴포넌트별 winner·margin·decisiveness + 변형 라벨", () => {
    const rows = [
      { component_type: "thumbnail", variant: "A", ctr_pct: 5.0, payload: { label: "직설형" } },
      { component_type: "thumbnail", variant: "B", ctr_pct: 6.5, payload: { label: "질문형" } },
    ];
    const out = buildAbSummaries(rows, TH);
    expect(out).toHaveLength(1);
    expect(out[0]?.component).toBe("thumbnail");
    expect(out[0]?.winner).toBe("B");
    expect(out[0]?.decisiveness).toBe("decisive"); // (6.5-5)/5 = 0.30
    expect(out[0]?.variants.find((v) => v.variant === "B")?.label).toBe("질문형");
  });

  it("payload에 label 없으면 null", () => {
    const out = buildAbSummaries([{ component_type: "title", variant: "A", ctr_pct: 4, payload: null }], TH);
    expect(out[0]?.variants[0]?.label).toBeNull();
  });

  it("해당 컴포넌트 행 없으면 제외", () => {
    const out = buildAbSummaries([{ component_type: "thumbnail", variant: "A", ctr_pct: 4, payload: null }], TH);
    expect(out.map((o) => o.component)).toEqual(["thumbnail"]); // title 없음
  });
});

describe("선택 요약(summarizeChoicePayload)", () => {
  it("제목/썸네일 키 추출", () => {
    expect(summarizeChoicePayload({ title: "ISA 3년", thumbnail_copy: "지금 시작" })).toBe("제목: ISA 3년 · 썸네일: 지금 시작");
  });
  it("outline 배열 요약", () => {
    expect(summarizeChoicePayload({ outline: ["도입", "본론", "마무리"] })).toContain("구성: 도입 → 본론 → 마무리");
  });
  it("알려진 키 없으면 압축 JSON", () => {
    expect(summarizeChoicePayload({ foo: "bar" })).toBe('{"foo":"bar"}');
  });
  it("null 안전", () => {
    expect(summarizeChoicePayload(null)).toBe("");
  });
});

describe("회고 출력 스키마", () => {
  it("필수 필드 + 인사이트 카테고리 enum", () => {
    expect(RETROSPECTIVE_SCHEMA.required).toEqual(["good_points", "improvements", "lessons", "insights"]);
    const cat = (RETROSPECTIVE_SCHEMA.properties as any).insights.items.properties.category.enum;
    expect(cat).toEqual([...INSIGHT_CATEGORIES]);
  });
});
