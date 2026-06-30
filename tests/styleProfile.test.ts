// 썸네일 스타일 환류(PhaseA Step1) 순수 함수 테스트 — DB·LLM 무관.
//   핵심: appendThumbnailStyle이 프로필 없을 때 시스템 프롬프트를 바이트 단위로 보존한다(픽스처 해시 보존).
import { describe, it, expect } from "vitest";
import { appendThumbnailStyle, appendTitleStyle, appendStructureStyle, type ActiveThumbnailStyle } from "../src/agents/shared/styleProfile.js";

const BASE = "너는 훅이다.\n제목·썸네일을 제안한다.";

const PROFILE: ActiveThumbnailStyle = {
  id: "style:abc-123",
  version: 2,
  patterns: {
    copy: { hook_patterns: ["연봉 N 이하 꼭 보세요"], length_notes: "짧게" },
    visual: { face: "정면 클로즈업" },
    banned: ["사색적 톤"],
  },
};

describe("appendThumbnailStyle (순수)", () => {
  it("프로필이 있으면 스타일 섹션과 id·patterns를 시스템에 덧붙인다", () => {
    const out = appendThumbnailStyle(BASE, PROFILE);
    expect(out).not.toBe(BASE);
    expect(out.startsWith(BASE)).toBe(true); // 베이스는 앞에 그대로 보존
    expect(out).toContain("김짠부 썸네일 스타일 사양");
    expect(out).toContain("style:abc-123"); // evidence 링크용 id 노출
    expect(out).toContain("연봉 N 이하 꼭 보세요"); // patterns 내용 포함
    expect(out).toContain("사색적 톤");
  });

  it("프로필이 null이면 시스템을 바이트 단위로 보존한다(해시 불변)", () => {
    const out = appendThumbnailStyle(BASE, null);
    expect(out).toBe(BASE);
  });

  it("patterns가 빈 객체면 보존한다", () => {
    const out = appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: {} });
    expect(out).toBe(BASE);
  });

  it("patterns가 null/비-객체/배열이면 보존한다(깨진 patterns 가드)", () => {
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: null })).toBe(BASE);
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: "깨짐" })).toBe(BASE);
    expect(appendThumbnailStyle(BASE, { id: "style:x", version: 1, patterns: ["a", "b"] })).toBe(BASE);
  });
});

describe("appendTitleStyle (순수) — 썸네일 미러", () => {
  it("프로필이 있으면 제목 스타일 섹션과 id·patterns를 시스템에 덧붙인다", () => {
    const out = appendTitleStyle(BASE, PROFILE);
    expect(out).not.toBe(BASE);
    expect(out.startsWith(BASE)).toBe(true);
    expect(out).toContain("김짠부 제목 스타일 사양");
    expect(out).not.toContain("김짠부 썸네일 스타일 사양"); // 제목 섹션이지 썸네일이 아니다
    expect(out).toContain("style:abc-123");
    expect(out).toContain("연봉 N 이하 꼭 보세요");
  });

  it("프로필이 null이면 시스템을 바이트 단위로 보존한다(해시 불변·조건부 주입)", () => {
    expect(appendTitleStyle(BASE, null)).toBe(BASE);
  });

  it("patterns가 빈/깨진 값이면 보존한다(가드)", () => {
    expect(appendTitleStyle(BASE, { id: "style:x", version: 1, patterns: {} })).toBe(BASE);
    expect(appendTitleStyle(BASE, { id: "style:x", version: 1, patterns: null })).toBe(BASE);
    expect(appendTitleStyle(BASE, { id: "style:x", version: 1, patterns: ["a"] })).toBe(BASE);
  });

  it("CTR 과장 문구를 제거하고 raw 채널 제목 기반으로 정정한다", () => {
    const out = appendTitleStyle(BASE, PROFILE);
    expect(out).not.toContain("CTR"); // v3는 raw 채널 제목 기반 → CTR 언급 없음
    expect(out).toContain("김짠부 채널 제목들에서 추출한");
  });
});

// title 시그니처 강제 렌더(title-style-mandate step0).
const TITLE_PROFILE_V3: ActiveThumbnailStyle = {
  id: "style:title-v3",
  version: 3,
  patterns: {
    signature_words: ["짠테크", "월급쟁이", "지금 당장"],
    banned: ["~로 부자되는 법", "사색"],
    skeletons: {
      title: [
        { template: "{target}이 {keyword} 시작하는 법", slots: ["target", "keyword"] },
        { template: "월급 {number}으로 1억 모으기", slots: ["number"] },
      ],
    },
    length_notes: "짧고 직설적으로",
  },
};

describe("appendTitleStyle — 시그니처 강제 렌더(skeletons·signature_words·banned)", () => {
  it("skeletons.title을 강제 템플릿 블록으로 렌더하고 '최소 1~2개' 강제 문구를 넣는다", () => {
    const out = appendTitleStyle(BASE, TITLE_PROFILE_V3);
    expect(out).toContain("김짠부 제목 골격");
    expect(out).toContain("{target}이 {keyword} 시작하는 법"); // 템플릿 그대로 노출
    expect(out).toContain("월급 {number}으로 1억 모으기");
    expect(out).toContain("최소 1~2개"); // 강제 채움 지시
    expect(out).toContain("(슬롯: target, keyword)"); // slots 가독 노출
  });

  it("signature_words를 별도 강조 블록으로 노출하고 적극 활용을 지시한다", () => {
    const out = appendTitleStyle(BASE, TITLE_PROFILE_V3);
    expect(out).toContain("김짠부 시그니처 워딩");
    expect(out).toContain("짠테크");
    expect(out).toContain("월급쟁이");
    expect(out).toContain("적극 활용");
  });

  it("banned를 가독 블록으로 노출하고 피하라고 지시한다", () => {
    const out = appendTitleStyle(BASE, TITLE_PROFILE_V3);
    expect(out).toContain("피하라");
    expect(out).toContain("~로 부자되는 법");
  });

  it("강조 3키(skeletons·signature_words·banned)는 JSON 덤프 키로 들어가지 않는다(중복 노출 방지)", () => {
    const out = appendTitleStyle(BASE, TITLE_PROFILE_V3);
    expect(out).not.toContain('"skeletons"');
    expect(out).not.toContain('"signature_words"');
    expect(out).not.toContain('"banned"');
    // 나머지 패턴은 여전히 JSON 덤프로 들어간다.
    expect(out).toContain('"length_notes"');
  });

  it("결정적이다(두 번 호출 바이트 동일)", () => {
    expect(appendTitleStyle(BASE, TITLE_PROFILE_V3)).toBe(appendTitleStyle(BASE, TITLE_PROFILE_V3));
  });

  it("3키가 없는 프로필(PROFILE)은 강조 블록을 추가하지 않는다(기존 동작 보존)", () => {
    const out = appendTitleStyle(BASE, PROFILE);
    expect(out).not.toContain("김짠부 제목 골격");
    expect(out).not.toContain("김짠부 시그니처 워딩");
    expect(out).toContain("김짠부 제목 스타일 사양"); // 집계 패턴 블록은 그대로
  });

  it("깨진 3키(배열 아님·template 비-문자열 등)는 크래시 없이 블록 생략", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:title-bad",
      version: 1,
      patterns: {
        signature_words: "깨짐", // 배열 아님 → 생략
        banned: [123, ""], // 유효 문자열 0개 → 생략
        skeletons: { title: "깨짐" }, // title이 배열 아님 → 생략
        length_notes: "짧게",
      },
    };
    const out = appendTitleStyle(BASE, profile);
    expect(out).not.toContain("김짠부 제목 골격");
    expect(out).not.toContain("김짠부 시그니처 워딩");
    expect(out).not.toContain("피하라");
    expect(out).toContain("김짠부 제목 스타일 사양"); // 베이스 블록은 유지
  });

  it("skeletons.title 항목 중 깨진 것(template 없음)은 폐기하고 유효 항목만 렌더", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:title-mixed",
      version: 1,
      patterns: {
        skeletons: {
          title: [
            { slots: ["number"] }, // template 없음 → 폐기
            { template: "", slots: [] }, // 빈 template → 폐기
            { template: "정상 골격 {keyword}", slots: ["keyword"] }, // 유효
            "문자열항목", // 폐기
          ],
        },
      },
    };
    const out = appendTitleStyle(BASE, profile);
    expect(out).toContain("김짠부 제목 골격");
    expect(out).toContain("정상 골격 {keyword}");
  });
});

const STRUCTURE_PROFILE: ActiveThumbnailStyle = {
  id: "style:struct-77",
  version: 3,
  patterns: {
    section_archetypes: ["공감형 오프닝", "사례 먼저", "실행 체크리스트"],
    flow_principles: ["쉬운 것 먼저", "공감→정보→실행"],
    hook_placement: "첫 10초 안에 공감 훅",
    anxiety_relief: "어려운 용어 직전에 안심 한 마디",
    misconception_handling: "흔한 오해를 사례로 먼저 깬다",
    ordering_notes: "공감→정보→실행 순",
    banned: ["사색적 여백형 전개"],
  },
};

describe("appendStructureStyle (순수) — 썸네일/제목 미러", () => {
  it("프로필이 있으면 구성 사양 섹션과 id·patterns를 시스템에 덧붙인다", () => {
    const out = appendStructureStyle(BASE, STRUCTURE_PROFILE);
    expect(out).not.toBe(BASE);
    expect(out.startsWith(BASE)).toBe(true); // 베이스는 앞에 그대로 보존
    expect(out).toContain("김짠부 구성 사양");
    expect(out).not.toContain("김짠부 썸네일 스타일 사양"); // 구성 섹션이지 썸네일이 아니다
    expect(out).toContain("style:struct-77"); // evidence 링크용 id 노출
    expect(out).toContain("공감형 오프닝"); // patterns 내용 포함
    expect(out).toContain("사색적 여백형 전개"); // banned 포함
  });

  it("같은 입력이면 결정적이다(바이트 동일)", () => {
    expect(appendStructureStyle(BASE, STRUCTURE_PROFILE)).toBe(appendStructureStyle(BASE, STRUCTURE_PROFILE));
  });

  it("프로필이 null이면 시스템을 바이트 단위로 보존한다(해시 불변·조건부 주입)", () => {
    expect(appendStructureStyle(BASE, null)).toBe(BASE);
  });

  it("patterns가 빈/깨진 값이면 보존한다(가드)", () => {
    expect(appendStructureStyle(BASE, { id: "style:x", version: 1, patterns: {} })).toBe(BASE);
    expect(appendStructureStyle(BASE, { id: "style:x", version: 1, patterns: null })).toBe(BASE);
    expect(appendStructureStyle(BASE, { id: "style:x", version: 1, patterns: "깨짐" })).toBe(BASE);
    expect(appendStructureStyle(BASE, { id: "style:x", version: 1, patterns: ["a", "b"] })).toBe(BASE);
  });
});

// reference_outlines few-shot 렌더(outline-fewshot-render step1).
const STRUCTURE_PROFILE_WITH_OUTLINES: ActiveThumbnailStyle = {
  id: "style:struct-99",
  version: 4,
  patterns: {
    section_archetypes: ["공감형 오프닝"],
    flow_principles: ["쉬운 것 먼저"],
    hook_placement: "첫 10초 안에 공감 훅",
    anxiety_relief: "안심 한 마디",
    misconception_handling: "오해를 먼저 깬다",
    ordering_notes: "공감→정보→실행",
    banned: ["사색적 톤"],
    reference_outlines: [
      {
        topic: "월급 200으로 1억 모으기",
        outline: [
          { section: "왜 지금 시작해야 하나" },
          { section: "통장 쪼개기", note: "3단계로" },
        ],
      },
      {
        topic: "신용카드 끊는 법",
        outline: [{ section: "체크카드 전환" }],
      },
    ],
  },
};

describe("appendStructureStyle — reference_outlines few-shot 렌더", () => {
  it("reference_outlines가 있으면 가독 few-shot 블록을 덧붙인다(주제·섹션·note 포함)", () => {
    const out = appendStructureStyle(BASE, STRUCTURE_PROFILE_WITH_OUTLINES);
    expect(out).toContain("김짠부 실제 목차 예시");
    expect(out).toContain("[월급 200으로 1억 모으기]");
    expect(out).toContain(" 1. 왜 지금 시작해야 하나");
    expect(out).toContain(" 2. 통장 쪼개기 — 3단계로"); // note는 " — note"로 덧붙음
    expect(out).toContain("[신용카드 끊는 법]");
    expect(out).toContain(" 1. 체크카드 전환");
    // 집계 패턴은 여전히 JSON 덤프로 들어간다.
    expect(out).toContain("공감형 오프닝");
    // ★ 중복 노출 방지: reference_outlines는 JSON 덤프(키 노출)로는 들어가지 않는다.
    expect(out).not.toContain('"reference_outlines"');
  });

  it("결정적이다(두 번 호출 바이트 동일)", () => {
    expect(appendStructureStyle(BASE, STRUCTURE_PROFILE_WITH_OUTLINES)).toBe(
      appendStructureStyle(BASE, STRUCTURE_PROFILE_WITH_OUTLINES),
    );
  });

  it("reference_outlines 키가 없는 프로필은 step0 이전과 출력이 동일하다(few-shot 블록 없음)", () => {
    // STRUCTURE_PROFILE은 reference_outlines 키 자체가 없다 → JSON 덤프가 replacer 영향을 받지 않아 바이트 동일.
    const out = appendStructureStyle(BASE, STRUCTURE_PROFILE);
    expect(out).not.toContain("김짠부 실제 목차 예시");
    expect(out).toContain("김짠부 구성 사양"); // 집계 패턴 블록은 그대로
  });

  it("reference_outlines가 빈 배열이면 few-shot 블록을 추가하지 않는다", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:struct-empty",
      version: 1,
      patterns: { ...(STRUCTURE_PROFILE.patterns as Record<string, unknown>), reference_outlines: [] },
    };
    const out = appendStructureStyle(BASE, profile);
    expect(out).not.toContain("김짠부 실제 목차 예시");
    expect(out).toContain("김짠부 구성 사양");
  });

  it("깨진 reference_outlines(배열 아님)는 크래시 없이 블록 생략", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:struct-bad",
      version: 1,
      patterns: { ...(STRUCTURE_PROFILE.patterns as Record<string, unknown>), reference_outlines: "깨짐" },
    };
    const out = appendStructureStyle(BASE, profile);
    expect(out).not.toContain("김짠부 실제 목차 예시");
    expect(out).toContain("김짠부 구성 사양");
  });

  it("깨진 항목(topic 없음/outline 배열 아님/section 없음)은 폐기하고 유효 항목만 렌더", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:struct-mixed",
      version: 1,
      patterns: {
        ...(STRUCTURE_PROFILE.patterns as Record<string, unknown>),
        reference_outlines: [
          { outline: [{ section: "토픽 없음" }] }, // topic 없음 → 폐기
          { topic: "outline이 배열 아님", outline: "x" }, // 폐기
          { topic: "유효섹션 없음", outline: [{ note: "section 없음" }] }, // 유효 섹션 0개 → 폐기
          { topic: "정상 편", outline: [{ section: "정상 섹션" }] }, // 유효
          "문자열항목", // 폐기
        ],
      },
    };
    const out = appendStructureStyle(BASE, profile);
    expect(out).toContain("김짠부 실제 목차 예시");
    expect(out).toContain("[정상 편]");
    expect(out).toContain(" 1. 정상 섹션");
    expect(out).not.toContain("[토픽 없음]");
    expect(out).not.toContain("[outline이 배열 아님]");
    expect(out).not.toContain("[유효섹션 없음]");
  });

  it("유효 항목이 0개면 few-shot 블록을 생략한다(크래시 없음)", () => {
    const profile: ActiveThumbnailStyle = {
      id: "style:struct-allbad",
      version: 1,
      patterns: {
        ...(STRUCTURE_PROFILE.patterns as Record<string, unknown>),
        reference_outlines: [{ topic: "" }, { topic: "x", outline: [] }, 123],
      },
    };
    const out = appendStructureStyle(BASE, profile);
    expect(out).not.toContain("김짠부 실제 목차 예시");
    expect(out).toContain("김짠부 구성 사양");
  });
});
