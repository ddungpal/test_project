// 훅이 단계 스펙(제목 전용) — spine 복붙(prepare+toCandidates만 다름).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareHookMaker, type HookMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "./referenceGuard.js";
import type { HookMakerOutput } from "./schema.js";

export function hookStageSpec(runId: string): ProposalStageSpec<HookMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.title_thumb,
    prepare: (supa) => prepareHookMaker(supa, runId),
    toCandidates: (out, input): Candidate[] => {
      // prepare가 만든 reference_titles(있을 때만) — 유사도 가드용. input 없이 호출돼도 안전(빈 배열).
      const references = ((input as HookMakerInput | undefined)?.reference_titles ?? []).map((r) => r.text);
      return out.candidates.map((c, idx) => ({
        idx,
        payload: {
          title: c.title,
          // 제목도 레퍼런스를 통째로 베끼면 안 됨 — ref_similarity 유지(LLM 호출 후 변환 → promptHash 무관).
          ref_similarity: maxReferenceSimilarity(c.title, references),
        },
        reason: c.reason,
        evidence_ids: c.evidence_ids,
      }));
    },
  };
}
