// 김짠부 직접 피드백 학습 sweep 코어 — 활성 규칙 로드 → 추출(owner_feedback_extractor) → draft 삽입(style_profiles).
//   설계: docs/specs/2026-07-05-owner-feedback-rules-design.md.
//   ★ analogyRelearnSweep(supa 인자) 패턴 미러 — supa·extractor 를 deps 로 받아 테스트가 스텁 주입 가능.
//     서버액션(submitOwnerFeedback)은 이 코어를 requireOwner + createAdminClient 로 감싸는 얇은 래퍼다.
//   ★ version 은 반드시 해당 component_type(title_owner_rules|thumbnail_owner_rules) 스코프로 max+1(다른 타입과 섞지 마라).
//   ★ draft 까지만. activate 금지(사람 게이트 — 이후 step 버튼). training_sources 행 삽입 없음(v1 YAGNI).

import type { Supa } from "../pipeline/runState.js";
import type { LlmConfig } from "../llm/config.js";
import { loadConfig } from "../llm/config.js";
import type { CallLLMDeps } from "../llm/callLLM.js";
import { extractOwnerFeedbackRules } from "../agents/owner_feedback/step.js";
import type { OwnerFeedbackCandidates, OwnerFeedbackResult } from "../agents/owner_feedback/schema.js";
import { componentTypeFor, buildOwnerRulesDraftPatterns, type OwnerRuleSource } from "../app/actions/copyLearnMap.js";

/** sweep 입력 — UI 에서 조립한 피드백 1건. component 는 owner 규칙 스코프 선택자. */
export interface OwnerFeedbackSweepInput {
  component: "title" | "thumbnail";
  topic?: string;
  candidates: OwnerFeedbackCandidates;
  feedback: string;
}

/** sweep 결과 — draft 생성 여부/버전 + 최종 규칙 수. created:false 면 draft 미생성(빈 피드백 방어). */
export interface OwnerFeedbackSweepResult {
  created: boolean;
  version: number | null;
  id: string | null;
  ruleCount: number;
}

/** 테스트 주입용 deps — extractor 를 impl 함수로 격리(vi.fn 지양 규칙). */
export interface OwnerFeedbackSweepDeps {
  /** 기존 규칙 + 피드백 → 병합 규칙셋. 기본 = extractOwnerFeedbackRules. */
  extract?: (
    input: { component: "title" | "thumbnail"; existingRules: string[]; candidates: OwnerFeedbackCandidates; feedback: string },
    config: LlmConfig,
    callDeps?: Pick<CallLLMDeps, "driver">,
  ) => Promise<OwnerFeedbackResult>;
  config?: LlmConfig;
  /** extractor 로 넘길 LLM driver 주입(테스트). */
  driver?: CallLLMDeps["driver"];
}

/** style_profiles.patterns(owner_rules) 의 형태 — rules(주입될 규칙) + sources(provenance). */
interface OwnerRulesPatterns {
  rules?: string[];
  sources?: OwnerRuleSource[];
}

/**
 * 김짠부 직접 피드백 학습 sweep — 활성 owner 규칙에 이번 피드백을 병합한 draft 를 만든다.
 *   1) feedback 공백뿐 → draft 미생성(추출·INSERT 0). created:false·ruleCount=기존.
 *   2) 해당 component_type 활성(active) 행 로드 → existingRules(patterns.rules)·prevSources(patterns.sources).
 *   3) extract 1회 → 병합된 규칙셋.
 *   4) style_profiles(component_type, status='draft', version=해당 스코프 max+1) INSERT. patterns={rules,sources 누적}.
 *   activate 안 함(draft 만 — 사람 게이트).
 */
export async function submitOwnerFeedbackSweep(
  supa: Supa,
  input: OwnerFeedbackSweepInput,
  deps: OwnerFeedbackSweepDeps = {},
): Promise<OwnerFeedbackSweepResult> {
  const config = deps.config ?? loadConfig();
  const extract = deps.extract ?? ((i, cfg, cd) => extractOwnerFeedbackRules(i, cfg, cd));
  const componentType = componentTypeFor(input.component === "title" ? "title_owner" : "thumbnail_owner");

  // 2) 활성(active) owner 규칙 로드 — 없으면 existingRules=[]·prevSources=[].
  const { data: activeRow, error: ae } = await supa
    .from("style_profiles")
    .select("patterns")
    .eq("component_type", componentType)
    .eq("status", "active")
    .maybeSingle();
  if (ae) throw new Error(`style_profiles(${componentType}) active 조회 실패: ${ae.message}`);
  const patterns = (activeRow?.patterns ?? {}) as OwnerRulesPatterns;
  const existingRules = patterns.rules ?? [];
  const prevSources = patterns.sources ?? [];

  // 1) 빈 피드백 방어 — draft 안 만들고 기존 규칙 수만 반환(추출/INSERT 0).
  if (input.feedback.trim().length === 0) {
    return { created: false, version: null, id: null, ruleCount: existingRules.length };
  }

  // 3) 추출 1회 — 기존 규칙 + 이번 피드백 병합.
  const callDeps = deps.driver ? { driver: deps.driver } : undefined;
  const { rules } = await extract({ component: input.component, existingRules, candidates: input.candidates, feedback: input.feedback }, config, callDeps);

  // 4) draft INSERT — version 은 반드시 해당 component_type 스코프 max+1(다른 타입과 섞지 마라).
  const { data: maxRow, error: me } = await supa
    .from("style_profiles")
    .select("version")
    .eq("component_type", componentType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (me) throw new Error(`style_profiles(${componentType}) version 조회 실패: ${me.message}`);
  const version = (maxRow?.version ?? 0) + 1;

  const newSource: OwnerRuleSource = { candidates: input.candidates, feedback: input.feedback };
  if (input.topic && input.topic.trim()) newSource.topic = input.topic.trim(); // exactOptionalPropertyTypes — 있을 때만.
  const draftPatterns = buildOwnerRulesDraftPatterns(prevSources, rules, newSource);

  const { data: sp, error: se } = await supa
    .from("style_profiles")
    .insert({ component_type: componentType, version, patterns: draftPatterns as never, status: "draft" })
    .select("id, version")
    .single();
  if (se) throw new Error(`style_profiles(${componentType}) draft insert 실패: ${se.message}`);

  return { created: true, version: sp.version as number, id: sp.id as string, ruleCount: rules.length };
}
