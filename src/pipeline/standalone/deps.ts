// 단독 실행(standalone) 의존성 맵 + selection payload shaping — 순수 모듈.
//   "각 목표 단계가 진짜로 필요로 하는 시드 입력"만 선언한다(실제 다운스트림 소비 코드 기준).
//   ⚠ DB/Supabase/callLLM import 절대 금지. 타입·enums·순수 레지스트리(PIPELINE)만 의존한다.
//   진실 근거:
//     - structure(구다리)·research(셜록)는 썸네일을 쓰지 않는다 → seeds에 thumbnail stage 없음.
//     - topic/title selection은 다운스트림이 { title } 로 읽는다(researchCell:67-68, hook_maker).
//     - structure selection은 { approach, outline: OutlineSection[] } 로 소비된다(structurer/stage.ts).
//     - script는 selection(구성) + research_facts + explanation_assets를 시드로 받는다.

import type { Stage, RunState } from "../../domain/enums.js";
import { PIPELINE } from "../stages.js"; // 순수 레지스트리(DB/llm 없음) — enters 도출용.
import type { OutlineSection } from "../../agents/structurer/schema.js";

export type SeedKind = "selection" | "research_facts" | "explanation_assets";

export interface SeedSpec {
  kind: SeedKind;
  /** kind==="selection"일 때 어느 단계 selection을 시드할지(topic/title_thumb/structure). */
  stage?: Stage;
  /** UI 입력 식별자. */
  field: string;
  /** 한글 라벨. */
  label: string;
  required: boolean;
}

export interface StandaloneTarget {
  target: Stage;
  /** PIPELINE[target].enters — 단독 실행이 run을 이 상태로 시드해야 한다. */
  enters: RunState;
  seeds: SeedSpec[];
}

// ── 시드 스펙 헬퍼(중복 제거 + 의도 명시) ──────────────────────────────────────
const topicSeed = (required: boolean): SeedSpec => ({
  kind: "selection",
  stage: "topic",
  field: "topic",
  label: "주제",
  required,
});

const titleSeed = (required: boolean): SeedSpec => ({
  kind: "selection",
  stage: "title_thumb", // title_thumb = 역사적 이름, 현재 '제목 전용'.
  field: "title",
  label: "제목",
  required,
});

const structureSeed = (required: boolean): SeedSpec => ({
  kind: "selection",
  stage: "structure",
  field: "structure",
  label: "구성",
  required,
});

// enters는 PIPELINE에서 도출(하드코딩 금지 — drift 방지).
const enters = (t: Stage): RunState => PIPELINE[t].enters;

export const STANDALONE_DEPS: Record<Stage, StandaloneTarget> = {
  topic: {
    target: "topic",
    enters: enters("topic"),
    seeds: [],
  },
  title_thumb: {
    target: "title_thumb",
    enters: enters("title_thumb"),
    seeds: [topicSeed(true)],
  },
  thumbnail: {
    target: "thumbnail",
    enters: enters("thumbnail"),
    seeds: [topicSeed(true), titleSeed(true)],
  },
  structure: {
    target: "structure",
    enters: enters("structure"),
    // ⚠ 썸네일 없음 — 구다리는 주제·제목만 본다(제목은 optional).
    seeds: [topicSeed(true), titleSeed(false)],
  },
  research: {
    target: "research",
    enters: enters("research"),
    // ⚠ 썸네일 없음 — 셜록은 주제·구성(+선택적 제목)만 본다.
    seeds: [topicSeed(true), structureSeed(true), titleSeed(false)],
  },
  script: {
    target: "script",
    enters: enters("script"),
    seeds: [
      structureSeed(true),
      { kind: "research_facts", field: "facts", label: "검증된 사실", required: true },
      { kind: "explanation_assets", field: "assets", label: "예시 자산", required: false },
    ],
  },
};

// ── selection payload shaping(순수) ──────────────────────────────────────────
// 다운스트림 소비 모양에 정확히 맞춘다. research_facts/explanation_assets 행 빌더는 여기 없음(step3 몫).

/** 주제 selection — researchCell/hook_maker가 { title }로 읽는다. */
export function topicSelectionPayload(text: string): unknown {
  return { title: text };
}

/** 제목 selection — { title }로 소비된다. */
export function titleSelectionPayload(text: string): unknown {
  return { title: text };
}

/**
 * 구성 selection — structurer/stage.ts가 만드는 { approach, outline: OutlineSection[] }와 같은 키 구조.
 * 자유텍스트를 outline의 첫 section에 담는다(다운스트림은 outline을 unknown으로 직렬화하므로 텍스트 보존이 핵심).
 */
export function structureSelectionPayload(text: string): unknown {
  const outline: OutlineSection[] = [{ section: text, goal: "", why: "" }];
  return { approach: "사용자 입력 구성", outline };
}
