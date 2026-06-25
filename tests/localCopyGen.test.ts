// 로컬 카피 생성기(localCopyGen) 순수 함수 테스트 — DB·LLM·random·Date 무관.
//   핵심: 슬롯 치환·빈슬롯 누출 차단·banned 필터·offset 변주(결정적)·빈 입력 안전.
import { describe, it, expect } from "vitest";
import {
  fillTitleSkeletons,
  fillThumbnailSkeletons,
  type TitleSkeleton,
  type ThumbnailSkeleton,
  type LocalGenContext,
} from "../src/agents/shared/localCopyGen.js";

const CTX: LocalGenContext = { topic: "예금", keyword: "정기예금", number: "3", target: "사회초년생" };

const TITLE_SK: TitleSkeleton[] = [
  { template: "{number}년 묶이면 절대 깨지 마세요", slots: ["number"] },
  { template: "{target}이라면 {keyword} 무조건 보세요", slots: ["target", "keyword"] },
  { template: "{topic} 모르면 손해", slots: ["topic"] },
];

const THUMB_SK: ThumbnailSkeleton[] = [
  { main: ["{number}년 묶이면", "절대 깨지 마세요"], boxes: ["{target} 필수", "{keyword}"], slots: ["number", "target", "keyword"] },
  { main: ["{topic} 모르면", "손해입니다"], boxes: ["지금 확인"], slots: ["topic"] },
];

describe("fillTitleSkeletons (순수)", () => {
  it("슬롯이 전부 채워지면 count개 후보를 {title} 형태로 반환한다", () => {
    const out = fillTitleSkeletons(TITLE_SK, CTX, { count: 3 });
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ title: "3년 묶이면 절대 깨지 마세요" });
    expect(out[1]).toEqual({ title: "사회초년생이라면 정기예금 무조건 보세요" });
    expect(out[2]).toEqual({ title: "예금 모르면 손해" });
    // 빈 슬롯 누출 없음
    for (const c of out) expect(c.title).not.toMatch(/\{[a-z]+\}/);
  });

  it("count보다 많은 스켈레톤이 있어도 최대 count개만 반환한다", () => {
    const out = fillTitleSkeletons(TITLE_SK, CTX, { count: 2 });
    expect(out).toHaveLength(2);
  });

  it("ctx에 없는 슬롯이 템플릿에 남으면 그 후보를 버린다(개수 감소 허용)", () => {
    const ctx: LocalGenContext = { topic: "예금" }; // number/target/keyword 없음
    const out = fillTitleSkeletons(TITLE_SK, ctx, { count: 3 });
    // {topic}만 채울 수 있는 세번째 스켈레톤 1개만 살아남는다
    expect(out).toEqual([{ title: "예금 모르면 손해" }]);
  });

  it("빈 문자열 슬롯 값도 누락 취급해 버린다", () => {
    const ctx: LocalGenContext = { topic: "예금", number: "" };
    const out = fillTitleSkeletons([{ template: "{number}년", slots: ["number"] }], ctx, { count: 1 });
    expect(out).toEqual([]);
  });

  it("banned 표현이 substring으로 포함된 결과는 제외한다", () => {
    const out = fillTitleSkeletons(TITLE_SK, CTX, { count: 3, banned: ["모르면 손해"] });
    expect(out.map((c) => c.title)).not.toContain("예금 모르면 손해");
    expect(out).toHaveLength(2);
  });

  it("banned 미전달이면 필터하지 않는다", () => {
    const out = fillTitleSkeletons(TITLE_SK, CTX, { count: 3 });
    expect(out).toHaveLength(3);
  });

  it("offset 0과 1은 다른 후보 집합을 낸다(변주)", () => {
    const a = fillTitleSkeletons(TITLE_SK, CTX, { count: 2, offset: 0 });
    const b = fillTitleSkeletons(TITLE_SK, CTX, { count: 2, offset: 1 });
    expect(a).not.toEqual(b);
  });

  it("같은 offset 2회 호출은 동일 출력(결정적)", () => {
    const a = fillTitleSkeletons(TITLE_SK, CTX, { count: 2, offset: 1 });
    const b = fillTitleSkeletons(TITLE_SK, CTX, { count: 2, offset: 1 });
    expect(a).toEqual(b);
  });

  it("빈 skeletons/undefined면 빈 배열(throw 없음)", () => {
    expect(fillTitleSkeletons([], CTX, { count: 3 })).toEqual([]);
    expect(fillTitleSkeletons(undefined as unknown as TitleSkeleton[], CTX, { count: 3 })).toEqual([]);
  });
});

describe("fillThumbnailSkeletons (순수)", () => {
  it("슬롯이 전부 채워지면 {copy_main, copy_boxes} 형태로 반환한다", () => {
    const out = fillThumbnailSkeletons(THUMB_SK, CTX, { count: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      copy_main: ["3년 묶이면", "절대 깨지 마세요"],
      copy_boxes: ["사회초년생 필수", "정기예금"],
    });
    expect(out[1]).toEqual({
      copy_main: ["예금 모르면", "손해입니다"],
      copy_boxes: ["지금 확인"],
    });
    for (const c of out) {
      for (const line of [...c.copy_main, ...c.copy_boxes]) expect(line).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it("main 또는 boxes 중 한 라인이라도 슬롯을 못 채우면 스켈레톤 후보 전체를 버린다", () => {
    const ctx: LocalGenContext = { topic: "예금" }; // number/target/keyword 없음
    const out = fillThumbnailSkeletons(THUMB_SK, ctx, { count: 2 });
    // 첫 스켈레톤은 number/target/keyword 누락 → 통째 폐기. {topic}만 쓰는 두번째만 남음.
    expect(out).toEqual([{ copy_main: ["예금 모르면", "손해입니다"], copy_boxes: ["지금 확인"] }]);
  });

  it("boxes 라인 하나라도 깨지면 그 후보(부분 포함) 전체를 버린다", () => {
    const sk: ThumbnailSkeleton[] = [
      { main: ["{topic} 정리"], boxes: ["{target} 필수"], slots: ["topic", "target"] },
    ];
    const ctx: LocalGenContext = { topic: "예금" }; // target 없음 → boxes 깨짐 → 통째 폐기
    expect(fillThumbnailSkeletons(sk, ctx, { count: 1 })).toEqual([]);
  });

  it("banned가 main/boxes 어디든 substring으로 들어가면 그 후보 제외", () => {
    const out = fillThumbnailSkeletons(THUMB_SK, CTX, { count: 2, banned: ["손해입니다"] });
    expect(out).toHaveLength(1);
    expect(out[0]?.copy_main).toEqual(["3년 묶이면", "절대 깨지 마세요"]);
  });

  it("offset 0과 1은 다른 후보 집합(변주), 같은 offset은 결정적", () => {
    const a0 = fillThumbnailSkeletons(THUMB_SK, CTX, { count: 1, offset: 0 });
    const b0 = fillThumbnailSkeletons(THUMB_SK, CTX, { count: 1, offset: 0 });
    const a1 = fillThumbnailSkeletons(THUMB_SK, CTX, { count: 1, offset: 1 });
    expect(a0).toEqual(b0); // 결정적
    expect(a0).not.toEqual(a1); // 변주
  });

  it("빈 skeletons/undefined면 빈 배열(throw 없음)", () => {
    expect(fillThumbnailSkeletons([], CTX, { count: 2 })).toEqual([]);
    expect(fillThumbnailSkeletons(undefined as unknown as ThumbnailSkeleton[], CTX, { count: 2 })).toEqual([]);
  });
});
