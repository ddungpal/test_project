// 제목 스타일 학습 코어 — 파일 I/O 없이 LLM 추출 + DB 저장을 분리(서버리스 호환).
//   CLI(extract-title-style.ts)와 서버 액션(step1)이 공유한다. 코어만 위임 — 파일 산출물·출력은 호출부 몫.
//   재사용(재구현 금지): buildTitleStyleInput·TITLE_STYLE_SYSTEM·STYLE_EXTRACTION_SCHEMA·normalizePatterns·foldStrayPatternFields.
//   ⚠️ CTR/performance/ab_variants 일절 안 읽음 — 순수 '제목 스타일'만 학습한다.

import type { Supa } from "../pipeline/runState.js";
import type { LlmConfig } from "../llm/config.js";
import type { ChannelTitle } from "../ingest/channelTitles.js";
import { callLLM, type CallLLMDeps } from "../llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../llm/costGuard.js";
import {
  STYLE_EXTRACTION_SCHEMA,
  type StyleExtractionOutput,
} from "../agents/style_extractor/schema.js";
import {
  buildTitleStyleInput,
} from "../../scripts/extract-title-style.js";
import {
  TITLE_STYLE_SYSTEM,
  normalizePatterns,
  foldStrayPatternFields,
} from "../../scripts/learn-ab-style.js";

const RUN_ID = "title-style-extract"; // 비용 귀속 키(production_run 아님 — 학습 작업). CLI와 동일.

/**
 * 제목들 → LLM 1회로 제목 스타일 patterns 추출(DB 미접근·파일 미접근).
 *   유효 제목(공백 제거 후) 0개면 throw 대신 null 반환 — 호출부가 '학습할 신호 없음'을 분기.
 *   extract-title-style.ts main()의 callLLM + 정규화 로직과 동일.
 *   deps: 테스트에서 driver/config 주입용(미지정 시 config 인자로 CostGuard 생성·기본 백엔드).
 */
export async function extractTitleStylePatterns(
  titles: ChannelTitle[],
  config: LlmConfig,
  deps?: Pick<CallLLMDeps, "driver">,
): Promise<{ patterns: unknown; evidence_summary: string } | null> {
  // buildTitleStyleInput은 유효 제목 0개면 throw — 사전 유효성으로 null 분기(학습할 신호 없음).
  const hasValid = titles.some((t) => typeof t?.title === "string" && t.title.trim().length > 0);
  if (!hasValid) return null;

  const input = buildTitleStyleInput(titles);

  const ledger = new InMemoryCostLedger();
  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: ledger });

  const callDeps: CallLLMDeps = { config, costGuard };
  if (deps?.driver) callDeps.driver = deps.driver; // exactOptionalPropertyTypes — undefined 직접 대입 금지.
  const out = await callLLM<StyleExtractionOutput>(
    { roleId: "title_extractor", system: TITLE_STYLE_SYSTEM, input, schema: STYLE_EXTRACTION_SCHEMA, runId: RUN_ID, maxTokens: 4096 },
    callDeps,
  );

  // learn-ab-style 과 동일 정규화(appendTitleStyle 소비 형태 보장 — top-level stray 필드 접기 + ?? [] 안전 수령).
  const patterns = normalizePatterns(foldStrayPatternFields(out.data));
  return { patterns, evidence_summary: out.data.evidence_summary };
}

/**
 * patterns → style_profiles(component_type='title', version=title 스코프 max+1, status='draft') INSERT.
 *   ★ version 은 반드시 component_type='title' 필터로 조회(thumbnail_copy 등 다른 타입과 섞지 마라).
 *   활성화 안 함(draft만 — 사람 게이트). provenance 없음(raw 제목은 edition_id FK 부재).
 *   extract-title-style.ts main()의 DB 저장 블록과 동일 로직.
 */
export async function saveTitleStyleDraft(
  supa: Supa,
  patterns: unknown,
): Promise<{ id: string; version: number }> {
  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", "title")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: "title", version, patterns: patterns as never, status: "draft" })
    .select("id, version, status")
    .single();
  if (se) throw new Error(`style_profiles insert 실패: ${se.message}`);

  return { id: sp.id as string, version: sp.version as number };
}
