// 분기가 step — 케이스 분기 자산 생성(callLLM 1회). 검증된 사실'만' + 댓글 집계 신호(원문 비전송)를 받아 condition→outcome로 구조화.
//   정규화·grounded 폴백·드랍은 리콘실(researchReconcile.buildAssetRows → normalizeCaseAsset)이 코드로 처리. 여기는 호출만.
//   ★ governance C안: commentSignals는 코드 집계 신호(question_comment_count·keyword_signals)만 — 댓글 원문(body)은 절대 받지 않는다.
import { callLLM, type CallLLMDeps } from "../../llm/callLLM.js";
import type { ResearchFactContext } from "../numbers/step.js";
import { CASE_MINER_SCHEMA, CASE_MINER_SYSTEM, type CaseMinerOutput } from "./schema.js";

/** 분기가가 받는 'case 형식 섹션' 메타(구다리 outline의 format='case' 섹션). */
export interface CaseSection {
  section: string;
  goal: string;
}

/** 분기가가 받는 댓글 신호(★원문 비전송 — aggregateCommentSignals가 코드 집계한 신호만). */
export interface CommentSignalInput {
  question_comment_count: number;
  keyword_signals: { id: string; term: string; count: number }[];
}

export async function caseMinerStep(
  llm: CallLLMDeps,
  runId: string,
  input: { sections: CaseSection[]; facts: ResearchFactContext[]; commentSignals: CommentSignalInput },
): Promise<CaseMinerOutput["assets"]> {
  const r = await callLLM<CaseMinerOutput>(
    { roleId: "case_miner", system: CASE_MINER_SYSTEM, input, schema: CASE_MINER_SCHEMA, runId, maxTokens: 4096 },
    llm,
  );
  return r.data.assets;
}
