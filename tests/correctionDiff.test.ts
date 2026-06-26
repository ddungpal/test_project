// 교정쌍 차이 분석(correction_diff) 단위 테스트 — 순수 검증만(DB·LLM 무관).
//   ① CORRECTION_DIFF_SCHEMA 형태 + required 에 빈배열 가능 필드(added/removed/actionable_rules) 없음.
//   ② correctionToPromptText 가 썸네일·제목 payload + 빈/누락 필드를 안전 변환.
//   ③ correction_diff role 이 sonnet 으로 라우팅(과하지 않게).
//   ★ 실제 LLM 호출·fixtures/parity 파일 생성 금지($0·stray 금지) — 순수 단위만.
import { describe, it, expect } from "vitest";
import {
  CORRECTION_DIFF_SCHEMA,
  CORRECTION_DIFF_SYSTEM,
} from "../src/agents/correction_diff/schema.js";
import { correctionToPromptText } from "../src/agents/correction_diff/prepare.js";
import { resolveModel, roleTools, ROLES } from "../src/agents/roles.js";
import type { Json } from "../src/lib/supabase/database.types.js";

type SchemaNode = {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
};

describe("CORRECTION_DIFF_SCHEMA 형태", () => {
  const root = CORRECTION_DIFF_SCHEMA as SchemaNode;

  it("루트는 닫힌 object", () => {
    expect(root.type).toBe("object");
    expect(root.additionalProperties).toBe(false);
  });

  it("required = summary·tone·hook_angle·length_density 4개(string)만", () => {
    expect(root.required).toEqual(["summary", "tone", "hook_angle", "length_density"]);
  });

  it("빈배열 가능 필드(added·removed·actionable_rules)는 required 에 없다", () => {
    const req = root.required ?? [];
    expect(req).not.toContain("added");
    expect(req).not.toContain("removed");
    expect(req).not.toContain("actionable_rules");
    // properties 에는 등재되어 있어야 한다(additionalProperties:false 통과용).
    expect(root.properties?.added?.type).toBe("array");
    expect(root.properties?.removed?.type).toBe("array");
    expect(root.properties?.actionable_rules?.type).toBe("array");
  });

  it("required 로 선언된 모든 필드는 array 타입이 아니다(빈배열 누락 사고 방지)", () => {
    for (const reqKey of root.required ?? []) {
      const child = root.properties?.[reqKey];
      expect(child, `${reqKey} 가 properties 에 없음`).toBeDefined();
      expect(child?.type, `${reqKey} 는 array 면 안 됨`).not.toBe("array");
    }
  });

  it("시스템 프롬프트는 한국어 코치 지시와 actionable_rules 안내를 포함", () => {
    expect(CORRECTION_DIFF_SYSTEM).toContain("김짠부");
    expect(CORRECTION_DIFF_SYSTEM).toContain("actionable_rules");
    expect(CORRECTION_DIFF_SYSTEM).toContain("추측 금지");
  });
});

describe("correctionToPromptText (순수 변환)", () => {
  it("썸네일 payload → 메인카피/박스카피 텍스트", () => {
    const payload: Json = { copy_main: ["연봉 7500 이하 꼭 보세요"], copy_boxes: ["무조건", "필수"] };
    const out = correctionToPromptText("thumbnail", payload);
    expect(out).toContain("메인카피: 연봉 7500 이하 꼭 보세요");
    expect(out).toContain("박스카피: 무조건 | 필수");
  });

  it("제목 payload → 제목 텍스트 그대로", () => {
    const payload: Json = { title: "이거 모르면 손해입니다" };
    expect(correctionToPromptText("title", payload)).toBe("이거 모르면 손해입니다");
  });

  it("썸네일 빈/누락 필드는 (없음) 으로 안전 처리", () => {
    expect(correctionToPromptText("thumbnail", { copy_main: [], copy_boxes: [] })).toBe(
      "메인카피: (없음)\n박스카피: (없음)",
    );
    // 키 자체가 없어도 안전.
    expect(correctionToPromptText("thumbnail", {})).toBe("메인카피: (없음)\n박스카피: (없음)");
  });

  it("제목 빈/누락 → (없음)", () => {
    expect(correctionToPromptText("title", { title: "" })).toBe("(없음)");
    expect(correctionToPromptText("title", {})).toBe("(없음)");
  });

  it("payload 가 null·배열·원시값이어도 throw 없이 (없음) 처리", () => {
    expect(correctionToPromptText("title", null)).toBe("(없음)");
    expect(correctionToPromptText("thumbnail", [] as unknown as Json)).toBe(
      "메인카피: (없음)\n박스카피: (없음)",
    );
    // 배열에 문자열 아닌 원소 섞여도 제거.
    const dirty: Json = { copy_main: ["진짜", 123 as unknown as Json, "  ", "팁"] };
    expect(correctionToPromptText("thumbnail", dirty)).toContain("메인카피: 진짜 | 팁");
  });
});

describe("roles — correction_diff 등록", () => {
  it("correction_diff 가 ROLES 에 있고 roleId 안정 키", () => {
    expect(ROLES.correction_diff.roleId).toBe("correction_diff");
  });
  it("과하지 않게 sonnet 으로 라우팅", () => {
    expect(resolveModel("correction_diff")).toBe("sonnet");
  });
  it("도구 없음(분석 전용)", () => {
    expect(roleTools("correction_diff")).toEqual([]);
  });
});
