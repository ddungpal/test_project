// buildPriorTail 순수 헬퍼 회귀 가드.
//   섹션 격리 생성 루프에서 직전까지 작성된 대본의 '끝부분'을 다음 섹션 호출에 넘겨 연속성을 준다.
//   - 첫 섹션이면 segments가 비어 빈 문자열.
//   - prose text 위주로 이어붙이고, 뒤에서부터 채워 maxChars를 넘으면 앞을 자른다(끝이 남아야 이어쓰기가 자연스럽다).
//   - 블록 kind(table/case/visual)는 건너뛴다(text가 짧은 제목/라벨이라 연속성 꼬리로 부적합).
import { describe, it, expect } from "vitest";
import { buildPriorTail } from "../src/lib/scribe/priorTail.js";

describe("buildPriorTail", () => {
  it("빈 배열이면 빈 문자열", () => {
    expect(buildPriorTail([], 500)).toBe("");
  });

  it("prose 한 개면 그 텍스트를 반환", () => {
    expect(buildPriorTail([{ text: "안녕하세요 짠부입니다." }], 500)).toBe("안녕하세요 짠부입니다.");
  });

  it("여러 세그먼트를 순서대로 이어붙인다", () => {
    const out = buildPriorTail(
      [{ text: "첫 문장." }, { text: "둘째 문장." }, { text: "셋째 문장." }],
      500,
    );
    // 앞부터의 원문 순서가 보존돼야 이어쓰기 흐름이 맞다.
    expect(out).toContain("첫 문장.");
    expect(out).toContain("둘째 문장.");
    expect(out).toContain("셋째 문장.");
    expect(out.indexOf("첫 문장.")).toBeLessThan(out.indexOf("둘째 문장."));
    expect(out.indexOf("둘째 문장.")).toBeLessThan(out.indexOf("셋째 문장."));
  });

  it("maxChars 초과 시 끝부분만 남긴다(앞을 자른다)", () => {
    const segs = [{ text: "AAAA" }, { text: "BBBB" }, { text: "CCCC" }];
    const out = buildPriorTail(segs, 6);
    expect(out.length).toBeLessThanOrEqual(6);
    // 끝부분(마지막 세그먼트)이 남아야 한다 — 이어쓰기는 끝을 받아 시작하므로.
    expect(out.endsWith("CCCC")).toBe(true);
    // 맨 앞 세그먼트는 잘려 사라진다.
    expect(out.includes("AAAA")).toBe(false);
  });

  it("블록 kind(table/case/visual)는 건너뛰고 prose만 이어붙인다", () => {
    const out = buildPriorTail(
      [
        { text: "프로즈 앞", kind: "prose" },
        { text: "표 제목", kind: "table" },
        { text: "케이스 제목", kind: "case" },
        { text: "프로즈 뒤", kind: "prose" },
      ],
      500,
    );
    expect(out).toContain("프로즈 앞");
    expect(out).toContain("프로즈 뒤");
    expect(out).not.toContain("표 제목");
    expect(out).not.toContain("케이스 제목");
  });

  it("kind 미지정(undefined)은 prose로 취급한다(하위호환)", () => {
    const out = buildPriorTail([{ text: "kind 없는 세그먼트" }], 500);
    expect(out).toBe("kind 없는 세그먼트");
  });

  it("prose가 하나도 없으면 빈 문자열", () => {
    const out = buildPriorTail(
      [
        { text: "표", kind: "table" },
        { text: "비주얼", kind: "visual" },
      ],
      500,
    );
    expect(out).toBe("");
  });
});
