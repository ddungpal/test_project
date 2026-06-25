// copy-local-gen: 'callLLM 스킵' 의사결정의 단일 진실(순수). DB·LLM 없이 판정만 검증.
//   forceLlm/mode/localCount 조합 — 로컬 단락 vs LLM 폴백이 정확히 갈리는지 못박는다.
import { describe, it, expect } from "vitest";
import { decideLocalGen } from "../src/pipeline/stageContract.js";

describe("decideLocalGen(순수 판정) — 로컬 단락 vs LLM 폴백", () => {
  describe("forceLlm=true는 mode·localCount 무관하게 항상 llm", () => {
    for (const mode of ["hybrid", "llm", "local"] as const) {
      for (const localCount of [null, 0, 3] as const) {
        it(`mode=${mode}, localCount=${localCount} → llm`, () => {
          expect(decideLocalGen({ mode, forceLlm: true, localCount })).toBe("llm");
        });
      }
    }
  });

  describe("mode=llm은 forceLlm·localCount 무관하게 항상 llm", () => {
    for (const localCount of [null, 0, 3] as const) {
      it(`localCount=${localCount} → llm`, () => {
        expect(decideLocalGen({ mode: "llm", forceLlm: false, localCount })).toBe("llm");
      });
    }
  });

  describe("mode=local은 forceLlm=false면 localCount 무관하게 항상 local(폴백 없음)", () => {
    for (const localCount of [null, 0, 3] as const) {
      it(`localCount=${localCount} → local`, () => {
        expect(decideLocalGen({ mode: "local", forceLlm: false, localCount })).toBe("local");
      });
    }
  });

  describe("mode=hybrid는 로컬 후보가 1개 이상일 때만 local, 아니면 llm 폴백", () => {
    it("localCount>0 → local", () => {
      expect(decideLocalGen({ mode: "hybrid", forceLlm: false, localCount: 3 })).toBe("local");
      expect(decideLocalGen({ mode: "hybrid", forceLlm: false, localCount: 1 })).toBe("local");
    });
    it("localCount=0(후보 못 만듦) → llm 폴백", () => {
      expect(decideLocalGen({ mode: "hybrid", forceLlm: false, localCount: 0 })).toBe("llm");
    });
    it("localCount=null(로컬 불가: 훅 없음·스켈레톤 없음) → llm 폴백", () => {
      expect(decideLocalGen({ mode: "hybrid", forceLlm: false, localCount: null })).toBe("llm");
    });
  });
});
