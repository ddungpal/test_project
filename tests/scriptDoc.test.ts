// 대본 문서 export(buildScriptDocMarkdown) 순수 함수 단위 테스트 — DOM·서버·컴포넌트 무관(순수 함수만).
//   ★ 컴포넌트 import 금지(vitest @/ alias 없음 함정) — src/lib/export/scriptDoc.ts만 물린다.
//   검증: 4개 라벨·구분선 순서, 더보기란 빈 칸(플레이스홀더), 썸네일/제목 렌더, 블록(table/case/visual)+미지 kind prose 폴백.
import { describe, it, expect } from "vitest";
import {
  buildScriptDocMarkdown,
  SECTION_DIVIDER,
  type ScriptDocInput,
} from "../src/lib/export/scriptDoc.js";

function base(over: Partial<ScriptDocInput> = {}): ScriptDocInput {
  return {
    title: "대표 제목",
    thumbnailMain: ["상단 메인", "하단 메인"],
    thumbnailBoxes: ["박스A", "박스B"],
    segments: [{ text: "첫 문단입니다." }],
    ...over,
  };
}

describe("buildScriptDocMarkdown — 구조·라벨·구분선", () => {
  it("4개 라벨과 구분선이 순서대로 존재한다", () => {
    const md = buildScriptDocMarkdown(base());
    const iThumb = md.indexOf("**썸네일**");
    const iTitle = md.indexOf("**제목**");
    const iDesc = md.indexOf("**더보기란/고정댓글**");
    const iScript = md.indexOf("**🎬 스크립트**");
    expect(iThumb).toBeGreaterThanOrEqual(0);
    expect(iTitle).toBeGreaterThan(iThumb);
    expect(iDesc).toBeGreaterThan(iTitle);
    expect(iScript).toBeGreaterThan(iDesc);
  });

  it("섹션 구분선이 3개(라벨 4개 사이) 들어간다", () => {
    const md = buildScriptDocMarkdown(base());
    const count = md.split(SECTION_DIVIDER).length - 1;
    expect(count).toBe(3);
  });

  it("구분선은 em-dash 1개 + 하이픈 99개 = 100자(코퍼스 원본과 동일)", () => {
    expect(SECTION_DIVIDER.length).toBe(100);
    expect(SECTION_DIVIDER[0]).toBe("—"); // em-dash
    expect(SECTION_DIVIDER.slice(1)).toBe("-".repeat(99));
  });
});

describe("buildScriptDocMarkdown — 썸네일·제목", () => {
  it("썸네일 메인·박스를 코퍼스 표기로 렌더한다", () => {
    const md = buildScriptDocMarkdown(base());
    expect(md).toContain("메인 : 상단 메인");
    expect(md).toContain("메인 : 하단 메인");
    expect(md).toContain("작은 박스1 : 박스A");
    expect(md).toContain("작은 박스2 : 박스B");
  });

  it("메인·박스 개수가 달라도 있는 만큼만 렌더한다(throw 없음)", () => {
    const md = buildScriptDocMarkdown(
      base({ thumbnailMain: ["하나만"], thumbnailBoxes: [] }),
    );
    expect(md).toContain("메인 : 하나만");
    expect(md).not.toContain("작은 박스1");
  });

  it("대표 제목만 있으면 후보 목록 없음", () => {
    const md = buildScriptDocMarkdown(base());
    expect(md).toContain("대표 제목");
    expect(md).not.toContain("1. ");
  });

  it("titleAlternates가 있으면 1. 2.로 렌더한다", () => {
    const md = buildScriptDocMarkdown(base({ titleAlternates: ["후보 둘", "후보 셋"] }));
    expect(md).toContain("1. 후보 둘");
    expect(md).toContain("2. 후보 셋");
  });
});

describe("buildScriptDocMarkdown — 더보기란/고정댓글은 빈 칸", () => {
  it("자동 생성 없이 안내 플레이스홀더 한 줄만 넣는다", () => {
    const md = buildScriptDocMarkdown(base());
    const afterLabel = md.split("**더보기란/고정댓글**")[1] ?? "";
    const desc = afterLabel.split(SECTION_DIVIDER)[0] ?? "";
    expect(desc).toContain("직접 작성");
    // 대본 본문 같은 실내용이 이 섹션에 새지 않는다.
    expect(desc).not.toContain("첫 문단");
  });
});

describe("buildScriptDocMarkdown — 스크립트 블록 렌더", () => {
  it("prose(kind 미지정)는 text를 그대로 문단으로", () => {
    const md = buildScriptDocMarkdown(
      base({ segments: [{ text: "문단 하나" }, { kind: "prose", text: "문단 둘" }] }),
    );
    expect(md).toContain("문단 하나");
    expect(md).toContain("문단 둘");
  });

  it("table을 마크다운 표(헤더+구분행+행)로 렌더한다", () => {
    const md = buildScriptDocMarkdown(
      base({
        segments: [
          {
            kind: "table",
            text: "비교표",
            payload: {
              columns: ["항목", "A", "B"],
              rows: [["금리", "3%", "5%"]],
              caption: "파킹통장 비교",
            },
          },
        ],
      }),
    );
    expect(md).toContain("파킹통장 비교");
    expect(md).toContain("| 항목 | A | B |");
    expect(md).toContain("| --- | --- | --- |");
    expect(md).toContain("| 금리 | 3% | 5% |");
  });

  it("case를 intro + '- 만약 … → …' 분기로 렌더한다", () => {
    const md = buildScriptDocMarkdown(
      base({
        segments: [
          {
            kind: "case",
            text: "상황별",
            payload: {
              intro: "당신의 상황은?",
              branches: [
                { condition: "3개월 안에 쓸 돈이면", outcome: "파킹통장" },
                { condition: "3년 이상 묵힐 돈이면", outcome: "ISA" },
              ],
            },
          },
        ],
      }),
    );
    expect(md).toContain("당신의 상황은?");
    expect(md).toContain("- 만약 3개월 안에 쓸 돈이면 → 파킹통장");
    expect(md).toContain("- 만약 3년 이상 묵힐 돈이면 → ISA");
  });

  it("visual은 cueType 배지로 렌더한다", () => {
    const md = buildScriptDocMarkdown(
      base({
        segments: [
          { kind: "visual", text: "자막 큐", payload: { cue: "돈을 주차하세요", cueType: "subtitle" } },
        ],
      }),
    );
    expect(md).toContain("[자막: 돈을 주차하세요]");
  });

  it("visual cueType 없으면 일반 '화면' 배지", () => {
    const md = buildScriptDocMarkdown(
      base({ segments: [{ kind: "visual", text: "화면", payload: { cue: "가입 화면" } }] }),
    );
    expect(md).toContain("[화면: 가입 화면]");
  });

  it("알 수 없는 kind는 조용히 prose(text)로 폴백한다(throw 없음)", () => {
    const md = buildScriptDocMarkdown(
      base({ segments: [{ kind: "wat", text: "폴백 텍스트", payload: { junk: 1 } }] }),
    );
    expect(md).toContain("폴백 텍스트");
  });

  it("깨진 payload의 블록도 prose(text)로 폴백한다", () => {
    const md = buildScriptDocMarkdown(
      base({ segments: [{ kind: "table", text: "표 대신 텍스트", payload: { columns: "not-array" } }] }),
    );
    expect(md).toContain("표 대신 텍스트");
    expect(md).not.toContain("| ");
  });
});

describe("buildScriptDocMarkdown — 방어(빈 입력)", () => {
  it("빈 세그먼트·빈 썸네일이어도 throw하지 않고 라벨은 남는다", () => {
    expect(() =>
      buildScriptDocMarkdown({
        title: "제목만",
        thumbnailMain: [],
        thumbnailBoxes: [],
        segments: [],
      }),
    ).not.toThrow();
    const md = buildScriptDocMarkdown({
      title: "제목만",
      thumbnailMain: [],
      thumbnailBoxes: [],
      segments: [],
    });
    expect(md).toContain("**썸네일**");
    expect(md).toContain("**🎬 스크립트**");
  });

  it("입력을 변형하지 않는다(순수)", () => {
    const input = base({ titleAlternates: ["후보"] });
    const snapshot = JSON.stringify(input);
    buildScriptDocMarkdown(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
