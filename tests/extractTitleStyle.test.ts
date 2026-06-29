// 제목 스타일 추출(extract-title-style) 단위 테스트 — 순수 검증만(DB·LLM 무관, 과금 0).
//   ① buildTitleStyleInput 결정적 prep: raw 제목 → input 형태(비-문자열/공백 제거, 0개면 throw).
//   ② normalizePatterns 결과가 appendTitleStyle 이 소비하는 형태(비어있지 않은 객체)를 만족해 system 에 주입되는지.
import { describe, it, expect } from "vitest";
import { buildTitleStyleInput, type ChannelTitle } from "../scripts/extract-title-style.js";
import { normalizePatterns, foldStrayPatternFields } from "../scripts/learn-ab-style.js";
import { appendTitleStyle } from "../src/agents/shared/styleProfile.js";
import type { StyleExtractionOutput } from "../src/agents/style_extractor/schema.js";

const TITLES: ChannelTitle[] = [
  { video_id: "v1", title: "연봉 3000 이하 꼭 보세요", published_at: "2026-01-01T00:00:00Z" },
  { video_id: "v2", title: "통장 쪼개기 이렇게 하세요", published_at: "2026-01-02T00:00:00Z" },
  { video_id: "v3", title: "  ", published_at: "2026-01-03T00:00:00Z" }, // 공백 → 제거
  { video_id: "v4", title: "월 100만원 모으는 법", published_at: "2026-01-04T00:00:00Z" },
];

describe("buildTitleStyleInput (결정적 prep)", () => {
  it("raw 제목에서 creator·note·titles 입력을 구성한다(공백 제거)", () => {
    const input = buildTitleStyleInput(TITLES);
    expect(input.creator).toBe("김짠부");
    expect(input.note).toContain("제목 스타일");
    expect(input.titles).toEqual([
      "연봉 3000 이하 꼭 보세요",
      "통장 쪼개기 이렇게 하세요",
      "월 100만원 모으는 법",
    ]); // 공백 항목 v3 제거
  });

  it("CTR/performance 를 입력에 넣지 않는다(순수 제목 스타일 — titles 키만)", () => {
    const input = buildTitleStyleInput(TITLES) as unknown as Record<string, unknown>;
    expect(Object.keys(input).sort()).toEqual(["creator", "note", "titles"]);
  });

  it("같은 입력이면 결정적이다(바이트 동일 JSON)", () => {
    expect(JSON.stringify(buildTitleStyleInput(TITLES))).toBe(JSON.stringify(buildTitleStyleInput(TITLES)));
  });

  it("비-문자열 title 도 거른다", () => {
    const dirty = [
      { video_id: "x", title: 123 as unknown as string, published_at: "" },
      { video_id: "y", title: "정상 제목", published_at: "" },
    ];
    expect(buildTitleStyleInput(dirty).titles).toEqual(["정상 제목"]);
  });

  it("유효 제목 0개면 throw", () => {
    expect(() => buildTitleStyleInput([])).toThrow();
    expect(() => buildTitleStyleInput([{ video_id: "z", title: "   ", published_at: "" }])).toThrow();
  });
});

describe("normalizePatterns → appendTitleStyle 소비 계약", () => {
  // LLM 산출 형태를 모사(claude-p 가 종종 banned 를 top-level 로 낸다 — foldStrayPatternFields 가 접는다).
  // claude-p 가 banned 를 patterns 밖 top-level 로 내는 실제 사례 모사(patterns.banned 누락 → fold 가 접는다).
  const llmOut: StyleExtractionOutput = {
    patterns: {
      copy: {
        hook_patterns: ["연봉 N 이하 꼭 보세요"],
        structure: { description: "메인+호기심 갭", main_copy_notes: "핵심 키워드 노출", small_box_notes: "해당 없음" },
        emphasis_words: ["무조건", "꼭"],
        length_notes: "짧고 단정한 존댓말",
      },
      visual: { face: "해당 없음(제목)", layout_archetypes: [], color_usage: "해당 없음(제목)", number_treatment: "금액 그대로 노출", devices: [] },
    } as unknown as StyleExtractionOutput["patterns"], // banned 누락(top-level 로 냄) — 실제 claude-p 형태
    evidence_summary: "이긴 제목들은 금액·대상을 그대로 노출했다.",
    banned: ["~하라/~마라 반말 명령"], // top-level stray — fold 로 patterns 안으로 접힘
  };

  it("normalizePatterns 결과는 비어있지 않은 객체(copy/visual/banned 포함)", () => {
    const patterns = normalizePatterns(foldStrayPatternFields(llmOut));
    expect(typeof patterns).toBe("object");
    expect(Object.keys(patterns).length).toBeGreaterThan(0);
    expect(patterns.copy.hook_patterns).toContain("연봉 N 이하 꼭 보세요");
    expect(patterns.banned).toContain("~하라/~마라 반말 명령"); // top-level → patterns 안으로 접힘
  });

  it("정규화한 patterns 를 appendTitleStyle 에 넣으면 system 에 제목 스타일 섹션이 주입된다", () => {
    const patterns = normalizePatterns(foldStrayPatternFields(llmOut));
    const BASE = "너는 훅이다.";
    const out = appendTitleStyle(BASE, { id: "style:title-1", version: 1, patterns });
    expect(out).not.toBe(BASE); // 빈 patterns 가 아니므로 주입됨
    expect(out.startsWith(BASE)).toBe(true);
    expect(out).toContain("김짠부 제목 스타일 사양");
    expect(out).toContain("연봉 N 이하 꼭 보세요"); // patterns 내용 노출
    expect(out).toContain("style:title-1");
  });
});
