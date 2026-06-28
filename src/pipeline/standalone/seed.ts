// 단독 실행(standalone) 시더 — 코어(순수에 가까움, callLLM/llm import 절대 금지).
//   목표 단계만 평소처럼 돌리려고, 그 단계의 enters까지 임시 run을 '결정적으로' 끌어올린다(AI·비용 0).
//   1) content(produced/in_production) + production_run(is_standalone) insert. state는 트리거가 'created' 강제.
//   2) RUN_STATES 선형순서(=합법 forward 전이)를 created→enters까지 인접쌍으로 transitionRun walk(raw update 금지).
//   3) STANDALONE_DEPS[target].seeds 중 selection을 사용자 입력으로 stage_proposals+stage_selections에 시드
//      (getSelectedStagePayload 계약 정확 만족: candidates[0].idx===0, chosen_idx===0).
//   ⚠ script 타깃은 facts/assets 시드가 money-safety라 step3로 격리 → 즉시 throw.

import type { Json } from "../../lib/supabase/database.types.js";
import type { Supa } from "../runState.js";
import { transitionRun } from "../runState.js";
import { RUN_STATES, type Stage } from "../../domain/enums.js";
import {
  STANDALONE_DEPS,
  topicSelectionPayload,
  titleSelectionPayload,
  structureSelectionPayload,
} from "./deps.js";

/** seed.stage 별 selection payload shaping(순수 헬퍼 디스패치). */
function shapeSelectionPayload(stage: Stage, text: string): unknown {
  switch (stage) {
    case "topic":
      return topicSelectionPayload(text);
    case "title_thumb":
      return titleSelectionPayload(text);
    case "structure":
      return structureSelectionPayload(text);
    default:
      // deps.ts의 selection seeds는 topic/title_thumb/structure만 — 그 외는 설계상 도달 불가.
      throw new Error(`시드 불가 selection stage: ${stage}`);
  }
}

/**
 * 단독 실행용 임시 run을 시드하고 runId를 반환한다. callLLM 0회·비용 0.
 *   rawInputs: UI 입력(field → 텍스트). required인데 비면 throw, optional은 비면 생략.
 */
export async function seedStandaloneRun(
  supa: Supa,
  target: Stage,
  rawInputs: Record<string, string>,
): Promise<string> {
  // script는 research_facts/explanation_assets 시드(money-safety)가 필요 → step3 격리.
  if (target === "script") {
    throw new Error("script 단독 실행은 step3에서 구현");
  }

  const dep = STANDALONE_DEPS[target];

  // 1) content(produced/in_production) + run(is_standalone). state는 트리거가 'created' 강제 — 넣지 않음.
  const { data: content, error: ce } = await supa
    .from("contents")
    .insert({ source: "produced", status: "in_production" })
    .select("id")
    .single();
  if (ce) throw new Error(`contents insert 실패: ${ce.message}`);

  const { data: run, error: re } = await supa
    .from("production_runs")
    .insert({ content_id: content.id, is_standalone: true })
    .select("id")
    .single();
  if (re) throw new Error(`production_runs insert 실패: ${re.message}`);
  const runId = run.id;

  // 2) created→enters까지 인접쌍 walk(RUN_STATES 선형순서 = 합법 forward 전이). raw update 금지.
  const from = RUN_STATES.indexOf("created");
  const to = RUN_STATES.indexOf(dep.enters);
  if (to < from) throw new Error(`enters 인덱스 비정상: ${dep.enters}`);
  for (let i = from; i < to; i++) {
    const cur = RUN_STATES[i];
    const next = RUN_STATES[i + 1];
    if (!cur || !next) throw new Error(`walk 범위 비정상: i=${i}, enters=${dep.enters}`); // noUncheckedIndexedAccess 가드(실제 도달 불가).
    await transitionRun(supa, runId, cur, next);
  }

  // 3) selection 시드 — 사용자 입력이 있는 것만. required인데 없으면 throw.
  for (const seed of dep.seeds) {
    if (seed.kind !== "selection" || !seed.stage) continue; // facts/assets는 step3(여기 도달 안 함).
    const text = (rawInputs[seed.field] ?? "").trim();
    if (!text) {
      if (seed.required) throw new Error(`필수 입력 누락: ${seed.label}(${seed.field})`);
      continue; // optional 미입력 → 생략.
    }

    const shaped = shapeSelectionPayload(seed.stage, text);
    // getSelectedStagePayload 계약: candidates[0].idx===0, chosen_idx===0.
    const candidates = [{ idx: 0, payload: shaped, reason: "단독 시드", evidence_ids: [] as string[] }];
    const { data: proposal, error: pe } = await supa
      .from("stage_proposals")
      .insert({ run_id: runId, stage: seed.stage, candidates: candidates as unknown as Json })
      .select("id")
      .single();
    if (pe) throw new Error(`stage_proposals insert 실패(${seed.stage}): ${pe.message}`);

    const { error: se } = await supa
      .from("stage_selections")
      .insert({ proposal_id: proposal.id, chosen_idx: 0 });
    if (se) throw new Error(`stage_selections insert 실패(${seed.stage}): ${se.message}`);
  }

  return runId;
}
