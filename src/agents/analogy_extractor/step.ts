// 비유 스타일 추출 코어 — 트랜스크립트 뭉치 → LLM 1회로 비유 기법 프로필(AnalogyStylePatterns).
//   설계: docs/specs/2026-07-03-analogy-learning-design.md §4.2.
//   titleStyleLearn.ts extractTitleStylePatterns 패턴 미러 — callLLM 1회 + `?? []` 정규화.
//   ⚠️ 빈 가능 string[] 필드는 step 에서 `?? []` 로 안전 수령(schema required 제외 규칙과 짝).
//   유효 트랜스크립트 0개면 null 반환 — 호출부가 '학습할 신호 없음'을 분기(LLM 미호출·과금 0).
//   개발=claude-p($0), 운영=LLM 1회.

import type { LlmConfig } from "../../llm/config.js";
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../../llm/costGuard.js";
import type { ReelTranscript } from "../../lib/learning/transcribeReels.js";
import { ANALOGY_EXTRACTION_SCHEMA, ANALOGY_EXTRACTION_SYSTEM, type AnalogyStylePatterns } from "./schema.js";

const RUN_ID = "analogy-style-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업).

/** 트랜스크립트 뭉치를 LLM 입력 문자열로 조립. 각 릴스 이름 헤더 + 본문(결정적 — transcribeReels가 이미 정렬). */
function buildAnalogyInput(transcripts: ReelTranscript[]): string {
  return transcripts
    .map((t) => `## ${t.name}\n${t.transcript.trim()}`)
    .join("\n\n");
}

/**
 * 트랜스크립트 → LLM 1회로 비유 기법 프로필 추출(DB 미접근·파일 미접근).
 *   유효 트랜스크립트(공백 제거 후) 0개면 throw 대신 null 반환 — 호출부가 '학습할 신호 없음'을 분기.
 *   빈 가능 string[] 필드는 `?? []` 로 정규화(모델 누락 방어). distortion_guard 만 스키마 required.
 *   deps: 테스트에서 driver 주입용(미지정 시 config 인자로 CostGuard 생성·기본 백엔드).
 */
export async function extractAnalogyStylePatterns(
  transcripts: ReelTranscript[],
  config: LlmConfig,
  deps?: Pick<CallLLMDeps, "driver">,
): Promise<AnalogyStylePatterns | null> {
  // 유효 트랜스크립트 0개면 null(학습할 신호 없음) — LLM 미호출·과금 0.
  const valid = transcripts.filter((t) => typeof t?.transcript === "string" && t.transcript.trim().length > 0);
  if (valid.length === 0) return null;

  const input = buildAnalogyInput(valid);

  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  const callDeps: CallLLMDeps = { config, costGuard };
  if (deps?.driver) callDeps.driver = deps.driver; // exactOptionalPropertyTypes — undefined 직접 대입 금지.

  const out = await callLLM<AnalogyStylePatterns>(
    { roleId: "analogy_extractor", system: ANALOGY_EXTRACTION_SYSTEM, input, schema: ANALOGY_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
    callDeps,
  );

  // 빈 가능 필드 `?? []` 안전 수령 — 모델이 통째 누락해도 안전(schema required 제외 규칙과 짝).
  const d = out.data;
  const patterns: AnalogyStylePatterns = {
    techniques: d.techniques ?? [],
    target_domains: d.target_domains ?? [],
    do: d.do ?? [],
    banned: d.banned ?? [],
    distortion_guard: d.distortion_guard,
  };
  if (d.confidence) patterns.confidence = d.confidence; // exactOptionalPropertyTypes — 있을 때만.
  if (d.tentative_notes) patterns.tentative_notes = d.tentative_notes;
  return patterns;
}
