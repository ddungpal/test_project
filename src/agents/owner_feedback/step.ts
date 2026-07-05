// 김짠부 직접 피드백 추출 코어 — 기존 규칙 + 이번 피드백 → LLM 1회로 병합된 최우선 규칙셋(OwnerFeedbackResult).
//   설계: docs/specs/2026-07-05-owner-feedback-rules-design.md.
//   analogy_extractor step.ts 패턴 미러 — callLLM 1회 + `?? []` 정규화.
//   ⚠️ 빈 가능 string[] 필드(rules)는 step 에서 `?? []` 로 안전 수령(schema required 제외 규칙과 짝).
//   feedback 이 공백뿐이면 LLM 미호출 — 기존 규칙 그대로 반환(빈 입력 방어·과금 0).
//   개발=claude-p($0), 운영=LLM 1회.

import type { LlmConfig } from "../../llm/config.js";
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../../llm/costGuard.js";
import {
  OWNER_FEEDBACK_SCHEMA,
  OWNER_FEEDBACK_SYSTEM,
  type OwnerFeedbackCandidates,
  type OwnerFeedbackResult,
} from "./schema.js";

const RUN_ID = "owner-feedback-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

/** 추출 입력 — component·기존 규칙·후보(신뢰불가)·원문 피드백(신뢰불가). */
export interface OwnerFeedbackInput {
  component: "title" | "thumbnail";
  existingRules: string[];
  candidates: OwnerFeedbackCandidates;
  feedback: string;
}

/** candidates 를 사람이 읽을 결정적 문자열로. 제목=번호 목록, 썸네일=세트별 메인/박스. */
function formatCandidates(component: "title" | "thumbnail", candidates: OwnerFeedbackCandidates): string {
  if (component === "title") {
    const titles = candidates as string[];
    if (titles.length === 0) return "(후보 없음)";
    return titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  }
  const sets = candidates as { main: string[]; box: string[] }[];
  if (sets.length === 0) return "(후보 없음)";
  return sets
    .map((s, i) => {
      const main = s.main.length ? s.main.join(" / ") : "(없음)";
      const box = s.box.length ? s.box.join(" / ") : "(없음)";
      return `세트 ${i + 1}\n  메인: ${main}\n  박스: ${box}`;
    })
    .join("\n");
}

/**
 * 추출 입력 문자열을 결정적으로 조립. existingRules 는 지시 컨텍스트로, candidates·feedback 은
 *   신뢰불가 입력이라 <<UNTRUSTED_DATA>> ... <<END>> 델리미터로 감싼다(§10).
 */
function buildOwnerFeedbackInput(input: OwnerFeedbackInput): string {
  const componentLabel = input.component === "title" ? "제목" : "썸네일 카피(메인·박스 텍스트)";
  const existing =
    input.existingRules.length > 0
      ? input.existingRules.map((r, i) => `${i + 1}. ${r}`).join("\n")
      : "(아직 없음 — 이번이 첫 규칙)";
  return [
    `## 대상 컴포넌트\n${componentLabel}`,
    `## 기존 규칙(existing rules — 이번 피드백과 병합할 대상)\n${existing}`,
    "## 김짠부가 반응한 후보(근거 — 규칙에 그대로 베끼지 말 것)",
    "<<UNTRUSTED_DATA>>",
    formatCandidates(input.component, input.candidates),
    "<<END>>",
    "## 김짠부의 직접 피드백(원문)",
    "<<UNTRUSTED_DATA>>",
    input.feedback.trim(),
    "<<END>>",
  ].join("\n");
}

/**
 * 기존 규칙 + 이번 피드백 → LLM 1회로 병합된 최우선 규칙셋 추출(DB 미접근·파일 미접근).
 *   feedback 공백뿐이면 LLM 미호출 — { rules: existingRules, change_note: '' } 반환(빈 입력 방어·과금 0).
 *   rules 는 `?? []` 로 정규화(모델 누락 방어). change_note 만 스키마 required.
 *   deps: 테스트에서 driver 주입용(미지정 시 config 인자로 CostGuard 생성·기본 백엔드).
 */
export async function extractOwnerFeedbackRules(
  input: OwnerFeedbackInput,
  config: LlmConfig,
  deps?: Pick<CallLLMDeps, "driver">,
): Promise<OwnerFeedbackResult> {
  // 빈 입력 방어 — 피드백이 공백뿐이면 추출하지 않고 기존 규칙 그대로(LLM 미호출·과금 0).
  if (input.feedback.trim().length === 0) {
    return { rules: input.existingRules, change_note: "" };
  }

  const inputStr = buildOwnerFeedbackInput(input);

  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  const callDeps: CallLLMDeps = { config, costGuard };
  if (deps?.driver) callDeps.driver = deps.driver; // exactOptionalPropertyTypes — undefined 직접 대입 금지.

  const out = await callLLM<OwnerFeedbackResult>(
    { roleId: "owner_feedback_extractor", system: OWNER_FEEDBACK_SYSTEM, input: inputStr, schema: OWNER_FEEDBACK_SCHEMA, runId: RUN_ID, maxTokens: 2048 },
    callDeps,
  );

  // 빈 가능 rules `?? []` 안전 수령 — 모델이 통째 누락해도 안전(schema required 제외 규칙과 짝).
  return { rules: out.data.rules ?? [], change_note: out.data.change_note };
}
