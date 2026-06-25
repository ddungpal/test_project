// 재생성 변주 — buildRegenerateAugmentedSystem이 결정적이면서 promptHash를 차등화하는지,
//   forward(base 그대로) 경로는 hash 불변인지 박는다. DB·LLM 없이 순수 검증.
import { describe, it, expect } from "vitest";
import { buildRegenerateAugmentedSystem } from "../src/pipeline/regenerateVariation.js";
import { promptHash } from "../src/llm/promptHash.js";
import type { JsonSchema, ModelTier } from "../src/llm/types.js";

const SCHEMA: JsonSchema = { type: "object" };
const MODEL: ModelTier = "sonnet";
const hashBase = { roleId: "hook_maker", input: { topic: "절약" }, schema: SCHEMA, model: MODEL, maxTokens: 4096 };

describe("buildRegenerateAugmentedSystem(순수 변주)", () => {
  it("base와 이전 안 요약을 모두 포함하고, base와는 다른 문자열", () => {
    const out = buildRegenerateAugmentedSystem("BASE", [{ payload: { title: "A안" } }], 1);
    expect(out).toContain("BASE");
    expect(out).toContain("A안");
    expect(out).not.toBe("BASE");
  });

  it("attempt가 다르면(1 vs 2) 출력이 다르다 — 회차 nonce", () => {
    const priors = [{ payload: { title: "A안" } }];
    expect(buildRegenerateAugmentedSystem("BASE", priors, 1)).not.toBe(
      buildRegenerateAugmentedSystem("BASE", priors, 2),
    );
  });

  it("priors가 빈 배열이어도 throw 없이 회차 지시만 + base 포함", () => {
    const out = buildRegenerateAugmentedSystem("BASE", [], 1);
    expect(out).toContain("BASE");
    expect(out).toContain("1회차");
    expect(out).not.toBe("BASE");
  });

  it("base가 비면 그대로 반환(방어)", () => {
    expect(buildRegenerateAugmentedSystem("", [{ payload: { title: "A안" } }], 1)).toBe("");
  });

  it("title 없는 payload는 JSON 축약으로 요약(throw 없음)", () => {
    const out = buildRegenerateAugmentedSystem("BASE", [{ payload: { foo: "bar" } }], 1);
    expect(out).toContain("foo");
  });

  it("긴 요약은 120자 + … 로 상한", () => {
    const long = "x".repeat(300);
    const out = buildRegenerateAugmentedSystem("BASE", [{ payload: { title: long } }], 1);
    expect(out).toContain("…");
    expect(out).not.toContain("x".repeat(121)); // 121자 연속은 없어야(잘림)
  });

  it("결정적: 같은 (base, priors, attempt) → 동일 출력", () => {
    const a = buildRegenerateAugmentedSystem("BASE", [{ payload: { title: "A안" } }], 2);
    const b = buildRegenerateAugmentedSystem("BASE", [{ payload: { title: "A안" } }], 2);
    expect(a).toBe(b);
  });

  // reason(선택적 사용자 이유) 주입 — 미전달/공백이면 바이트 동일(불변식), 있으면 프롬프트에 반영.
  const priors = [{ payload: { title: "A안" } }];

  it("reason 미전달(undefined) → reason 인자 생략 출력과 정확히 동일(불변식)", () => {
    const withoutArg = buildRegenerateAugmentedSystem("BASE", priors, 1);
    const withUndefined = buildRegenerateAugmentedSystem("BASE", priors, 1, undefined);
    expect(withUndefined).toBe(withoutArg);
  });

  it("reason 빈문자열·공백뿐 → 동일(미주입)", () => {
    const base = buildRegenerateAugmentedSystem("BASE", priors, 1);
    expect(buildRegenerateAugmentedSystem("BASE", priors, 1, "")).toBe(base);
    expect(buildRegenerateAugmentedSystem("BASE", priors, 1, "   ")).toBe(base);
  });

  it("reason 있음 → 그 이유 문자열 포함 + 이전 후보 차별화 지시도 유지", () => {
    const out = buildRegenerateAugmentedSystem("BASE", priors, 1, "더 자극적으로");
    expect(out).toContain("더 자극적으로");
    expect(out).toContain("A안"); // 이전 후보 차별화 지시 유지
    expect(out).toContain("뚜렷이 다른"); // 기존 변주 지시 유지
    expect(out).not.toBe(buildRegenerateAugmentedSystem("BASE", priors, 1)); // reason 없음과 다름
  });
});

describe("promptHash 차등(핵심) — 재생성이 새 hash를 내고 forward는 불변", () => {
  const base = "SYSTEM_BASE";
  const priors = [{ payload: { title: "A안" } }];

  it("system만 base vs augmented → hash가 다르다", () => {
    const augmented = buildRegenerateAugmentedSystem(base, priors, 1);
    const hBase = promptHash({ ...hashBase, system: base });
    const hAug = promptHash({ ...hashBase, system: augmented });
    expect(hAug).not.toBe(hBase);
  });

  it("attempt 1 vs 2 → hash가 다르다(매 재생성 차등)", () => {
    const h1 = promptHash({ ...hashBase, system: buildRegenerateAugmentedSystem(base, priors, 1) });
    const h2 = promptHash({ ...hashBase, system: buildRegenerateAugmentedSystem(base, priors, 2) });
    expect(h2).not.toBe(h1);
  });

  it("forward 불변: base 그대로 두 번 → 같은 hash(픽스처 보존 증명)", () => {
    const h1 = promptHash({ ...hashBase, system: base });
    const h2 = promptHash({ ...hashBase, system: base });
    expect(h2).toBe(h1);
  });
});
