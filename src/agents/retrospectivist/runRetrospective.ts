// 회고 실행(Phase 4) — prepare → callLLM 1회 → retrospectives 1행 + insights draft 기록.
//   파이프라인 단계가 아니다(production_run에 안 묶임). 편당 1회·발행 후 저빈도.
//   개발=claude-p $0(record→fixture replay). 멱등 아님(재실행=새 회고 append) → 개발은 cleanupRetrospectives.
//
//   ★ insights는 항상 status='draft' + source_type='retrospective' + provenance FK(migration 18 A3 CHECK 충족).
//     승격(draft→approved)은 사람(김짠부)의 몫(슬라이스 3 UI). 회고는 '제안'까지만.

import type { Supa } from "../../pipeline/runState.js";
import type { TablesInsert } from "../../lib/supabase/database.types.js";
import { callLLM } from "../../llm/callLLM.js";
import { CostGuard, InMemoryCostLedger } from "../../llm/costGuard.js";
import { loadConfig, type LlmConfig } from "../../llm/config.js";
import { ROLES } from "../roles.js";
import { prepareRetrospective } from "./prepare.js";
import { RETROSPECTIVE_SCHEMA, RETROSPECTIVE_SYSTEM, type RetrospectiveOutput } from "./schema.js";

export interface RetrospectiveResult {
  retrospectiveId: string;
  insightCount: number;
  costUsd: number;
  output: RetrospectiveOutput;
  skipped?: "no_performance";
}

/**
 * 한 콘텐츠의 회고를 실행. config 미지정 시 env에서 로드. costGuard는 자체 구성(런에 안 묶임).
 *   성과 데이터가 없으면 회고를 건너뛴다(입력이 없으면 인과 분석 불가).
 */
export async function runRetrospective(supa: Supa, contentId: string, opts: { config?: LlmConfig } = {}): Promise<RetrospectiveResult> {
  const config = opts.config ?? loadConfig();
  const input = await prepareRetrospective(supa, contentId, config.ab);

  if (!input.has_performance) {
    return {
      retrospectiveId: "",
      insightCount: 0,
      costUsd: 0,
      skipped: "no_performance",
      output: { good_points: "", improvements: "", lessons: "", insights: [] },
    };
  }

  const costGuard = new CostGuard({ softCapUsd: config.softCapUsd, hardCapUsd: config.hardCapUsd, sink: new InMemoryCostLedger() });
  const res = await callLLM<RetrospectiveOutput>(
    {
      runId: `retro:${contentId}`, // 비용 키(런 아님). claude-p는 $0.
      roleId: ROLES.retrospectivist.roleId,
      system: RETROSPECTIVE_SYSTEM,
      input,
      schema: RETROSPECTIVE_SCHEMA,
    },
    { config, costGuard },
  );
  const output = res.data;

  // retrospectives 1행.
  const { data: retro, error: re } = await supa
    .from("retrospectives")
    .insert({
      content_id: contentId,
      scope: "content",
      good_points: output.good_points,
      improvements: output.improvements,
      lessons: output.lessons,
    })
    .select("id")
    .single();
  if (re) throw new Error(`retrospectives insert 실패: ${re.message}`);

  // insights draft N개 — 근거(evidence)는 body에 합쳐 보존(insights에 evidence 컬럼 없음).
  let insightCount = 0;
  if (output.insights.length > 0) {
    const rows: TablesInsert<"insights">[] = output.insights.map((it) => ({
      category: it.category,
      title: it.title,
      body: `${it.body}\n\n[근거] ${it.evidence}`,
      confidence: clamp01(it.confidence),
      status: "draft",
      source_type: "retrospective",
      source_retrospective_id: retro.id,
      source_content_id: contentId,
    }));
    const { error: ie } = await supa.from("insights").insert(rows);
    if (ie) {
      // 원자성 보상 — insights 실패 시 방금 만든 retrospective를 되돌려 반쪽 상태를 남기지 않는다.
      await supa.from("retrospectives").delete().eq("id", retro.id);
      throw new Error(`insights insert 실패(retrospective 롤백됨): ${ie.message}`);
    }
    insightCount = rows.length;
  }

  return { retrospectiveId: retro.id, insightCount, costUsd: res.costUsd, output };
}

/** 회고 대상 선별(순수) — 성과는 있으나 아직 회고가 없는 콘텐츠만, 입력 순서 유지·중복 제거·bounded. */
export function eligibleForRetrospective(withPerformance: string[], withRetrospective: string[], limit: number): string[] {
  const done = new Set(withRetrospective);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of withPerformance) {
    if (done.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export interface SweepResult {
  eligible: number;
  ran: number;
  results: { contentId: string; insightCount: number; skipped?: "no_performance" }[];
}

/**
 * 회고 자동 sweep(운영 자동화 ①) — 성과가 적재됐는데 아직 회고가 없는 콘텐츠를 찾아 회고 실행.
 *   ★ 멱등: 회고가 생기면 다음 sweep서 제외 → 재실행·retry 안전(콘텐츠당 1회 정책). 재실행은 cleanup 후 수동.
 *   개발=claude-p $0. 운영=API(콘텐츠당 1회 LLM) → limit으로 1회 비용 상한.
 */
export async function retrospectiveSweep(supa: Supa, opts: { limit?: number; config?: LlmConfig } = {}): Promise<SweepResult> {
  const limit = opts.limit ?? 20;
  const { data: perf, error: pe } = await supa.from("performance_metrics").select("content_id").eq("ab_variant", "overall");
  if (pe) throw new Error(`performance_metrics 조회 실패: ${pe.message}`);
  const { data: retro, error: re } = await supa.from("retrospectives").select("content_id");
  if (re) throw new Error(`retrospectives 조회 실패: ${re.message}`);

  const withPerf = [...new Set((perf ?? []).map((r) => r.content_id))];
  const withRetro = (retro ?? []).map((r) => r.content_id).filter((v): v is string => !!v);
  const eligible = eligibleForRetrospective(withPerf, withRetro, limit);

  const results: SweepResult["results"] = [];
  for (const contentId of eligible) {
    const r = await runRetrospective(supa, contentId, opts.config ? { config: opts.config } : {});
    results.push(r.skipped ? { contentId, insightCount: 0, skipped: r.skipped } : { contentId, insightCount: r.insightCount });
  }
  return { eligible: eligible.length, ran: results.filter((r) => !r.skipped).length, results };
}

/** 개발 재실행용 역연산 — 이 content의 회고·인사이트 draft 삭제(승격된 insight는 detach해 보존). */
export async function cleanupRetrospectives(supa: Supa, contentId: string): Promise<{ retrospectives: number; insights: number; detached: number }> {
  // 1) retrospective 기원 draft insight만 삭제(approved/reviewed는 사람이 승격한 것 → 보존).
  const del = await supa
    .from("insights")
    .delete()
    .eq("source_content_id", contentId)
    .eq("source_type", "retrospective")
    .eq("status", "draft")
    .select("id");
  if (del.error) throw new Error(`insights draft 삭제 실패: ${del.error.message}`);

  // 2) 살아남는 승격분(reviewed/approved)을 detach. retrospectives 삭제 시 FK가 SET NULL 되며
  //    source_type='retrospective'와 충돌(migration 18 A3 CHECK: retro FK ⇔ source_type)하므로,
  //    먼저 FK를 끊고 source_type도 함께 바꿔(사람이 승격 = human_authored) 정합을 유지한 뒤 부모를 지운다.
  const detach = await supa
    .from("insights")
    .update({ source_retrospective_id: null, source_type: "human_authored" })
    .eq("source_content_id", contentId)
    .eq("source_type", "retrospective") // 1)에서 draft 제거 후 = reviewed/approved 만 남음
    .select("id");
  if (detach.error) throw new Error(`insights detach 실패: ${detach.error.message}`);

  // 3) 이제 이 content의 retrospectives를 참조하는 retro-insight 없음 → 안전 삭제.
  const delR = await supa.from("retrospectives").delete().eq("content_id", contentId).select("id");
  if (delR.error) throw new Error(`retrospectives 삭제 실패: ${delR.error.message}`);

  return { retrospectives: delR.data?.length ?? 0, insights: del.data?.length ?? 0, detached: detach.data?.length ?? 0 };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
