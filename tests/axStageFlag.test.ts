// AX 단계 전환 플래그 단위 테스트 — 순수 함수만(DB·LLM·네트워크 0).
//   ★ process.env 직접 오염 금지 — 가짜 env 객체를 주입해 테스트한다.
import { describe, it, expect } from "vitest";
import { parseAxStages, isAxStage, resolveToneInjection, AX_TONE_MARKER } from "../src/pipeline/axFlag.js";

// 가짜 env 헬퍼 — process.env를 건드리지 않는다(NODE_ENV 등 다른 키 없이 AX_STAGES만 주입).
const env = (v?: string): NodeJS.ProcessEnv =>
  (v === undefined ? {} : { AX_STAGES: v }) as NodeJS.ProcessEnv;

describe("parseAxStages — AX_STAGES 파싱", () => {
  it("쉼표구분 stage들을 Set으로", () => {
    const s = parseAxStages(env("script,title_thumb"));
    expect(s).toEqual(new Set(["script", "title_thumb"]));
  });

  it("미설정(undefined) → 빈 Set", () => {
    expect(parseAxStages(env())).toEqual(new Set<string>());
  });

  it("빈 문자열 → 빈 Set", () => {
    expect(parseAxStages(env(""))).toEqual(new Set<string>());
  });

  it("공백 trim·중복 정규화·미지 stage 무시", () => {
    // " script , script ,bogus" → script만(중복 합쳐지고 bogus 무시).
    const s = parseAxStages(env(" script , script ,bogus"));
    expect(s).toEqual(new Set(["script"]));
    expect(s.has("bogus")).toBe(false);
  });

  it("유효 5단계만 통과(topic|title_thumb|structure|research|script)", () => {
    const s = parseAxStages(env("topic,title_thumb,structure,research,script,unknown"));
    expect(s).toEqual(new Set(["topic", "title_thumb", "structure", "research", "script"]));
  });

  it("기본 인자(process.env) 호출도 동작(타입·런타임 가드)", () => {
    expect(parseAxStages()).toBeInstanceOf(Set);
  });
});

describe("isAxStage", () => {
  it("켜진 stage는 true", () => {
    expect(isAxStage("script", new Set(["script"]))).toBe(true);
  });
  it("안 켜진 stage는 false", () => {
    expect(isAxStage("topic", new Set(["script"]))).toBe(false);
  });
  it("빈 Set이면 모두 false", () => {
    expect(isAxStage("script", new Set<string>())).toBe(false);
  });
});

describe("resolveToneInjection — 기본 무전환(바이트 불변)", () => {
  it("빈 Set이면 ragComponents를 그대로(===) 반환 — null", () => {
    const empty = new Set<string>();
    expect(resolveToneInjection("script", null, empty)).toBe(null);
  });

  it("빈 Set이면 ragComponents를 그대로(===) 반환 — 객체 참조 동일", () => {
    const empty = new Set<string>();
    const rag = { register: "구어체", markers: ["~거든요"] };
    const out = resolveToneInjection("script", rag, empty);
    expect(out).toBe(rag); // 참조 동일 = 1바이트도 안 바뀜
  });
});

describe("resolveToneInjection — AX 전환·롤백", () => {
  it("AX stage면 AX_TONE_MARKER 반환(RAG와 다름)", () => {
    const ax = new Set(["script"]);
    const rag = { register: "구어체" };
    const out = resolveToneInjection("script", rag, ax);
    expect(out).toBe(AX_TONE_MARKER);
    expect(out).not.toBe(rag);
    expect(out).toEqual({ internalized: true });
  });

  it("비-AX stage는 RAG와 동일(같은 Set이라도 stage 다르면 통과)", () => {
    const ax = new Set(["title_thumb"]); // script는 안 켜짐
    const rag = { register: "구어체" };
    const out = resolveToneInjection("script", rag, ax);
    expect(out).toBe(rag);
  });

  it("롤백: stage 추가→마커, 제거→다시 X(순수 함수라 입력만으로)", () => {
    const rag = { register: "구어체" };
    // 켰을 때
    expect(resolveToneInjection("script", rag, new Set(["script"]))).toBe(AX_TONE_MARKER);
    // 다시 끄면(빈 Set) 원본 그대로 복귀
    expect(resolveToneInjection("script", rag, new Set<string>())).toBe(rag);
  });
});
