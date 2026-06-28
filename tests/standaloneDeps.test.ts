// 단독 실행 의존성 맵 + selection payload shaping — 순수 모듈 단위 테스트.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  STANDALONE_DEPS,
  topicSelectionPayload,
  titleSelectionPayload,
  structureSelectionPayload,
} from "../src/pipeline/standalone/deps.js";
import { PIPELINE } from "../src/pipeline/stages.js";
import { STAGES } from "../src/domain/enums.js";

describe("STANDALONE_DEPS — 시드 의존성 맵", () => {
  it("모든 Stage에 대해 target이 채워져 있다", () => {
    for (const s of STAGES) {
      expect(STANDALONE_DEPS[s].target).toBe(s);
    }
  });

  it("각 타깃 enters는 PIPELINE[target].enters와 일치(하드코딩 drift 없음)", () => {
    for (const s of STAGES) {
      expect(STANDALONE_DEPS[s].enters).toBe(PIPELINE[s].enters);
    }
  });

  it("topic: 시드 없음", () => {
    expect(STANDALONE_DEPS.topic.seeds).toEqual([]);
  });

  it("title_thumb: 주제(required)만", () => {
    expect(STANDALONE_DEPS.title_thumb.seeds).toEqual([
      { kind: "selection", stage: "topic", field: "topic", label: "주제", required: true },
    ]);
  });

  it("thumbnail: 주제(required) + 제목(required)", () => {
    expect(STANDALONE_DEPS.thumbnail.seeds).toEqual([
      { kind: "selection", stage: "topic", field: "topic", label: "주제", required: true },
      { kind: "selection", stage: "title_thumb", field: "title", label: "제목", required: true },
    ]);
  });

  it("structure: 주제(required) + 제목(optional), 썸네일 없음", () => {
    expect(STANDALONE_DEPS.structure.seeds).toEqual([
      { kind: "selection", stage: "topic", field: "topic", label: "주제", required: true },
      { kind: "selection", stage: "title_thumb", field: "title", label: "제목", required: false },
    ]);
    // 썸네일 stage가 시드에 없음을 명시적으로 단언.
    const stages = STANDALONE_DEPS.structure.seeds.map((s) => s.stage);
    expect(stages).not.toContain("thumbnail");
  });

  it("research: 주제(required) + 구성(required) + 제목(optional), 썸네일 없음", () => {
    expect(STANDALONE_DEPS.research.seeds).toEqual([
      { kind: "selection", stage: "topic", field: "topic", label: "주제", required: true },
      { kind: "selection", stage: "structure", field: "structure", label: "구성", required: true },
      { kind: "selection", stage: "title_thumb", field: "title", label: "제목", required: false },
    ]);
    const stages = STANDALONE_DEPS.research.seeds.map((s) => s.stage);
    expect(stages).not.toContain("thumbnail");
  });

  it("script: 구성(required) + research_facts(required) + explanation_assets(optional)", () => {
    expect(STANDALONE_DEPS.script.seeds).toEqual([
      { kind: "selection", stage: "structure", field: "structure", label: "구성", required: true },
      { kind: "research_facts", field: "facts", label: "검증된 사실", required: true },
      { kind: "explanation_assets", field: "assets", label: "예시 자산", required: false },
    ]);
  });
});

describe("selection payload shaping 헬퍼", () => {
  it("topicSelectionPayload → { title } 이고 텍스트 보존", () => {
    expect(topicSelectionPayload("2030 재테크")).toEqual({ title: "2030 재테크" });
  });

  it("titleSelectionPayload → { title } 이고 텍스트 보존", () => {
    expect(titleSelectionPayload("월 100 모으는 법")).toEqual({ title: "월 100 모으는 법" });
  });

  it("structureSelectionPayload → { approach, outline:[{section,goal,why}] } 이고 텍스트 보존", () => {
    const text = "인트로 → 공포 → 해소 → 행동";
    const payload = structureSelectionPayload(text) as {
      approach: string;
      outline: Array<{ section: string; goal: string; why: string }>;
    };
    expect(payload.approach).toBe("사용자 입력 구성");
    expect(payload.outline).toHaveLength(1);
    expect(payload.outline[0]).toEqual({ section: text, goal: "", why: "" });
    // structurer/stage.ts가 만드는 키 구조와 동일(approach + outline).
    expect(Object.keys(payload).sort()).toEqual(["approach", "outline"]);
  });
});

describe("순수성 — DB/Supabase/callLLM import 없음", () => {
  it("deps.ts 소스가 금지 모듈을 import하지 않는다", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../src/pipeline/standalone/deps.ts"), "utf8");
    // import 구문만 검사(주석엔 설명상 단어가 들어갈 수 있으므로).
    const importLines = src
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l));
    const imports = importLines.join("\n");
    expect(imports).not.toMatch(/supabase/i);
    expect(imports).not.toMatch(/callLLM/i);
    expect(imports).not.toMatch(/\/llm\//);
    expect(imports).not.toMatch(/runState/);
    // 허용된 의존만(enums, stages, schema 타입).
    for (const l of importLines) {
      expect(l).toMatch(/domain\/enums|stages|structurer\/schema/);
    }
  });
});
