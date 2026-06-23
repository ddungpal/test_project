// 구다리 단계 스펙 — spine 복붙.
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareStructurer } from "./prepare.js";
import type { StructurerOutput } from "./schema.js";

export function structureStageSpec(runId: string): ProposalStageSpec<StructurerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.structure,
    prepare: (supa) => prepareStructurer(supa, runId),
    toCandidates: (out): Candidate[] =>
      out.candidates.map((c, idx) => ({
        idx,
        payload: { approach: c.approach, outline: c.outline },
        reason: c.reason,
        evidence_ids: c.evidence_ids,
      })),
  };
}
