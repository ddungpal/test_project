// 구성 추출(structure_extractor) — 출력 스키마 + 추출 시스템 프롬프트. step0(structure-style-learning).
//
// 산출물 = style_profiles.patterns(jsonb, component_type='structure'). 김짠부 완성 스크립트 코퍼스에서
// "따라 짤 수 있는 구성/전개 사양"을 뽑는다. 말투(tone)는 '말하는 방식', 썸네일 스타일은 '표현 방식',
// 여기는 스크립트의 '구성/전개 방식'(섹션 유형·순서 원칙·훅 배치·불안 완화·오개념 처리)만 다룬다.
//
// ⚠️ 빈 배열이 될 수 있는 string[] 필드는 절대 required에 넣지 않는다.
//   (forced tool_use도 required 100% 보장 못 함 → 빈배열 시 모델이 통째 누락 → api 무재시도서
//    전체 실패. 과거 critic 사건.) 빈 가능 필드는 step에서 `?? []` 기본값으로 받는다.

import type { JsonSchema } from "../../llm/types.js";

/** style_profiles.patterns(component_type='structure') 의 형태. DB jsonb로 그대로 저장된다. */
export interface StructureStylePatterns {
  /** 반복되는 섹션 유형(예: "공감형 오프닝","사례 먼저","오개념 박살","실행 체크리스트"). 빈 가능 → required 제외. */
  section_archetypes: string[];
  /** 전개 순서 원칙(예: 쉬운 것 먼저, 공감→정보→실행). 빈 가능 → required 제외. */
  flow_principles: string[];
  /** 오프닝 훅을 어디·어떻게 배치하는가. string 필수. */
  hook_placement: string;
  /** 불안 완화 패턴(어디서·어떻게 안심시키는가). string 필수. */
  anxiety_relief: string;
  /** 오개념 선제 제거 방식. string 필수. */
  misconception_handling: string;
  /** 전형적 전개 순서 메모. string 필수. */
  ordering_notes: string;
  /** 김짠부가 안 쓰는 구성(banned). 빈 가능 → required 제외. */
  banned: string[];
  /** 전반 신뢰도(저표본 경계). high=여러 편 반복, tentative=소표본. 옵셔널(누락 허용). */
  confidence?: "high" | "tentative";
  /** 저표본·소수 사례 경고(tentative 패턴 메모). 빈 배열 가능 → required 제외. */
  tentative_notes?: string[];
  /**
   * 코퍼스 각 편의 실제 목차(few-shot 참조용). 집계 패턴(section_archetypes 등)과 다른, 구체 목차다.
   * 옵셔널(없어도 1단계 동작 보존). 렌더링은 step1 몫(여기선 추출·저장만).
   */
  reference_outlines?: {
    /** 그 편 주제. */
    topic: string;
    /** 실제 목차(섹션 순서대로, 각 한 줄). */
    outline: { section: string; note?: string }[];
  }[];
}

export interface StructureExtractionOutput {
  patterns: StructureStylePatterns;
  /** 추출 근거 요약(검수용, DB 미저장 — source_ref와 함께 사람이 읽고 판단). */
  evidence_summary: string;
  /**
   * ★ claude-p 가 banned/confidence/tentative_notes 를 patterns 밖 top-level 로 자주 출력한다.
   *   그 형태도 스키마 검증을 통과시키기 위한 top-level 옵셔널 거울 필드(아래 STRUCTURE_STYLE_SCHEMA 참조).
   *   소비 측은 foldStructureStrayFields 가 patterns 안으로 접어넣어 nested 구조로 정규화한다(다운스트림 불변).
   */
  banned?: StructureStylePatterns["banned"];
  confidence?: StructureStylePatterns["confidence"];
  tentative_notes?: StructureStylePatterns["tentative_notes"];
  /** claude-p 가 reference_outlines 를 patterns 밖 top-level 로 낼 경우의 거울 필드(foldStructureStrayFields 가 흡수). */
  reference_outlines?: StructureStylePatterns["reference_outlines"];
}

const strArray = { type: "array", items: { type: "string" } } as const;

// banned/confidence/tentative_notes 3필드 스키마 — patterns 내부와 top-level 양쪽에서 재사용한다.
//   (claude-p 가 이 3개를 top-level 로 토해내는 사례 방어 — 같은 스키마를 두 번 적지 않도록 const 로 추출.)
const bannedSchema = strArray; // 옵셔널 빈 가능 배열 — required 제외.
const confidenceSchema = { type: "string", enum: ["high", "tentative"] } as const; // 옵셔널.
const tentativeNotesSchema = strArray; // 옵셔널 빈 가능 배열 — required 제외.

// reference_outlines 스키마 — patterns 내부·top-level 거울 양쪽에서 재사용(드리프트 방지).
//   집계 패턴과 별개인 '구체 목차' 배열. 옵셔널·required 제외. 중첩 object 도 additionalProperties:false 로 닫는다.
const referenceOutlinesSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["topic"], // outline 은 빈 가능 → required 제외.
    properties: {
      topic: { type: "string" },
      outline: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["section"], // note 는 옵셔널.
          properties: {
            section: { type: "string" },
            note: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export const STRUCTURE_STYLE_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  // 배열 필드(section_archetypes·flow_principles·banned)·confidence·tentative_notes 는 required 제외.
  required: ["patterns", "evidence_summary"],
  properties: {
    patterns: {
      type: "object",
      additionalProperties: false,
      // string 필드만 required. 배열/옵셔널은 제외(빈배열/누락 허용 규칙).
      required: ["hook_placement", "anxiety_relief", "misconception_handling", "ordering_notes"],
      properties: {
        section_archetypes: strArray,
        flow_principles: strArray,
        hook_placement: { type: "string" },
        anxiety_relief: { type: "string" },
        misconception_handling: { type: "string" },
        ordering_notes: { type: "string" },
        // 아래 3개는 const 로 추출한 스키마를 참조(top-level 거울 필드와 동일 정의 — 드리프트 방지).
        banned: bannedSchema,
        confidence: confidenceSchema,
        tentative_notes: tentativeNotesSchema,
        // 구체 목차(few-shot). 집계 패턴과 별개. 옵셔널·required 제외. top-level 거울과 동일 정의.
        reference_outlines: referenceOutlinesSchema,
      },
    },
    evidence_summary: { type: "string" },
    // ★ top-level 거울 — claude-p 가 이 3개를 patterns 밖으로 출력하는 사례 허용(옵셔널, required 불변).
    //   additionalProperties:false 라 명시 등재해야 통과한다. 소비 측 foldStructureStrayFields 가 patterns 안으로 접는다.
    banned: bannedSchema,
    confidence: confidenceSchema,
    tentative_notes: tentativeNotesSchema,
    // ★ reference_outlines top-level 거울 — claude-p 가 patterns 밖으로 낼 사례 허용(옵셔널, required 불변).
    reference_outlines: referenceOutlinesSchema,
  },
};

/** 추출 시스템 프롬프트. 입력(스크립트)은 백엔드가 UNTRUSTED 델리미터로 감싼다(§10). */
export const STRUCTURE_EXTRACTION_SYSTEM = [
  "너는 유튜브 크리에이터 '김짠부'(재테크 채널)의 영상 구성을 분석하는 분석가다.",
  "아래 입력 데이터는 김짠부가 쓴 완성 스크립트 여러 편이다. 이 코퍼스만 근거로 구성/전개 패턴을 분해한다.",
  "",
  "목표: 다른 AI(구다리)가 김짠부 스타일로 새 영상 구성을 짤 수 있도록, 따라 짤 수 있는 '구성/전개 사양'을 만든다.",
  "원칙:",
  "- 추측·날조 금지. 코퍼스에 실제로 관찰된 것만 적는다(실재하는 것만). 예시는 입력에서 그대로 인용한다.",
  "- 말투(말하는 방식)나 썸네일 표현이 아니라 '구성/전개 방식'만 추출한다.",
  "추출 대상:",
  "- 반복되는 섹션 유형(section_archetypes): 예 '공감형 오프닝','사례 먼저','오개념 박살','실행 체크리스트'.",
  "- 전개 순서 원칙(flow_principles): 예 쉬운 것 먼저, 공감→정보→실행.",
  "- 훅(오프닝) 배치(hook_placement): 오프닝 훅을 어디·어떻게 거는가.",
  "- 불안 완화 위치(anxiety_relief): 시청자 불안을 어디서·어떻게 누그러뜨리는가.",
  "- 오개념 선제 제거 방식(misconception_handling): 흔한 오해를 언제·어떻게 깨는가.",
  "- 전형적 전개 순서 메모(ordering_notes).",
  "- 안 쓰는 구성(banned): 김짠부가 쓰지 않는/어울리지 않는 구성을 부재 근거로 적는다.",
  "- 표본이 적어 확신이 약하면 confidence='tentative' 와 tentative_notes 로 표시한다.",
  "- 추가로, 입력 스크립트 중 대표 편들의 실제 목차를 reference_outlines 로 충실히 출력하라 — 그 편이 실제로 전개된 섹션 순서대로, 각 섹션은 짧은 한 줄. 요약은 충실히, 날조·창작 금지(스크립트에 없는 섹션 추가 금지). 최대 6편만, 서로 구성이 다른 편 위주로.",
  "- 주의: 집계 패턴(section_archetypes·flow_principles 등)과 구체 목차(reference_outlines)는 서로 다른 것이다 — 집계 패턴은 여러 편에서 뽑은 일반 사양, reference_outlines 는 개별 편의 실제 목차다. 둘을 혼동하지 마라.",
  "- 한국어로 작성한다.",
].join("\n");
