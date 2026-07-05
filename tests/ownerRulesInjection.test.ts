// 김짠부 직접 피드백 규칙 주입(owner-feedback-rules step2) — appendTitleOwnerRules/appendThumbnailOwnerRules 순수함수.
//   (1) null → 원본 그대로(바이트 동일 → promptHash 불변).
//   (2) 빈 rules(`{rules:[]}`)·깨진 입력(patterns:null·patterns:[]·rules 비배열·유효 문자열 0개) → 원본 그대로.
//   (3) 정상 규칙 → "김짠부 최우선 지시" 헤더 + 각 규칙 문자열 포함.
//   (4) 순서: title/thumbnail style 블록 '뒤'에 규칙 블록이 온다(최우선=마지막 말이 이김).
//   ★ analogyStyleInjection.test.ts 미러. append* 는 순수함수라 driver/supa 스텁 불필요 — 문자열 검증으로 충분.
import { describe, it, expect } from "vitest";
import {
  appendTitleOwnerRules,
  appendThumbnailOwnerRules,
  appendTitleStyle,
  appendThumbnailStyle,
  loadActiveTitleOwnerRules,
  loadActiveThumbnailOwnerRules,
  type ActiveOwnerRules,
  type ActiveTitleStyle,
  type ActiveThumbnailStyle,
} from "../src/agents/shared/styleProfile.js";

const SYS = "너는 훅이다. 제목 후보를 만든다.";

describe("appendTitleOwnerRules / appendThumbnailOwnerRules — 비면 원본(해시 불변)", () => {
  it("ownerRules null 이면 system 원본 그대로(바이트 동일)", () => {
    expect(appendTitleOwnerRules(SYS, null)).toBe(SYS);
    expect(appendThumbnailOwnerRules(SYS, null)).toBe(SYS);
  });

  it("rules 가 빈 배열이면 원본 그대로", () => {
    const empty: ActiveOwnerRules = { id: "style:abc", version: 1, patterns: { rules: [] } };
    expect(appendTitleOwnerRules(SYS, empty)).toBe(SYS);
    expect(appendThumbnailOwnerRules(SYS, empty)).toBe(SYS);
  });

  it("patterns 가 null/배열/문자열이면 원본 그대로(깨진 입력 방어)", () => {
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: null })).toBe(SYS);
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: [] })).toBe(SYS);
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: "nope" })).toBe(SYS);
    expect(appendThumbnailOwnerRules(SYS, { id: "style:a", version: 1, patterns: null })).toBe(SYS);
  });

  it("rules 가 비배열이거나 유효 문자열 0개면 원본 그대로", () => {
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: { rules: "not-array" } })).toBe(SYS);
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: { rules: ["", "   "] } })).toBe(SYS);
    expect(appendTitleOwnerRules(SYS, { id: "style:a", version: 1, patterns: { rules: [1, null, {}] } })).toBe(SYS);
    expect(appendThumbnailOwnerRules(SYS, { id: "style:a", version: 1, patterns: { rules: ["", "   "] } })).toBe(SYS);
  });
});

describe("appendTitleOwnerRules / appendThumbnailOwnerRules — 정상 규칙이면 최우선 지시 append", () => {
  const rules: ActiveOwnerRules = {
    id: "style:owner-1",
    version: 2,
    patterns: {
      rules: ["제목엔 구체 수치를 포함한다", "낚시성 과장 금지"],
      sources: [{ topic: "무직 재테크", feedback: "숫자 없으면 안 눌러" }],
    },
  };

  it("반환은 원본 system 으로 시작하고 뒤에 최우선 지시 헤더가 붙는다", () => {
    const out = appendTitleOwnerRules(SYS, rules);
    expect(out.startsWith(SYS)).toBe(true);
    expect(out).not.toBe(SYS);
    expect(out).toContain("김짠부 최우선 지시");
  });

  it("각 규칙 문자열을 불릿으로 포함한다", () => {
    const out = appendThumbnailOwnerRules(SYS, rules);
    expect(out).toContain("- 제목엔 구체 수치를 포함한다");
    expect(out).toContain("- 낚시성 과장 금지");
  });

  it("공백은 트리밍하고 빈 규칙은 건너뛴다", () => {
    const messy: ActiveOwnerRules = {
      id: "style:owner-2",
      version: 1,
      patterns: { rules: ["  구체 수치  ", "", "   ", "낚시 금지"] },
    };
    const out = appendTitleOwnerRules(SYS, messy);
    expect(out).toContain("- 구체 수치");
    expect(out).toContain("- 낚시 금지");
    expect(out).not.toContain("-   \n");
  });
});

describe("loadActive*OwnerRules — 조회 실패는 throw 하지 않고 null 폴백(best-effort)", () => {
  // 로드 실패로 파이프라인을 막지 않는다: 없으면 base 프롬프트로 돌아야 한다(getOwnerRulesDrafts 패턴 미러).
  function fakeSupa(result: { data: unknown; error: { message: string } | null }) {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = async () => result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return chain as any;
  }

  it("조회 error 면 throw 하지 않고 null 반환", async () => {
    const supa = fakeSupa({ data: null, error: { message: "boom" } });
    await expect(loadActiveTitleOwnerRules(supa)).resolves.toBeNull();
    await expect(loadActiveThumbnailOwnerRules(supa)).resolves.toBeNull();
  });

  it("데이터 없음(error null·data null)도 null 반환", async () => {
    const supa = fakeSupa({ data: null, error: null });
    await expect(loadActiveTitleOwnerRules(supa)).resolves.toBeNull();
    await expect(loadActiveThumbnailOwnerRules(supa)).resolves.toBeNull();
  });
});

describe("owner 규칙은 style 블록 '뒤(맨 마지막)'에 온다 — 최우선=마지막 말이 이김", () => {
  const titleStyle: ActiveTitleStyle = {
    id: "style:title-x",
    version: 1,
    patterns: { signature_words: ["짠부"], banned: ["대박"] },
  };
  const thumbnailStyle: ActiveThumbnailStyle = {
    id: "style:thumb-x",
    version: 1,
    patterns: { copy: "직설", visual: "yellow" },
  };
  const ownerRules: ActiveOwnerRules = {
    id: "style:owner-3",
    version: 1,
    patterns: { rules: ["구체 수치를 넣어라"] },
  };

  it("제목: appendTitleStyle 결과에 append 하면 style 섹션 인덱스 < owner 규칙 헤더 인덱스", () => {
    const withStyle = appendTitleStyle(SYS, titleStyle);
    const out = appendTitleOwnerRules(withStyle, ownerRules);
    const styleIdx = out.indexOf("김짠부 제목 스타일 사양");
    const ownerIdx = out.indexOf("김짠부 최우선 지시");
    expect(styleIdx).toBeGreaterThanOrEqual(0);
    expect(ownerIdx).toBeGreaterThan(styleIdx);
  });

  it("썸네일: appendThumbnailStyle 결과에 append 하면 style 섹션 인덱스 < owner 규칙 헤더 인덱스", () => {
    const withStyle = appendThumbnailStyle(SYS, thumbnailStyle);
    const out = appendThumbnailOwnerRules(withStyle, ownerRules);
    const styleIdx = out.indexOf("김짠부 썸네일 스타일 사양");
    const ownerIdx = out.indexOf("김짠부 최우선 지시");
    expect(styleIdx).toBeGreaterThanOrEqual(0);
    expect(ownerIdx).toBeGreaterThan(styleIdx);
  });
});
