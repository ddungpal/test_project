// 훅이 단계 스펙 — spine 복붙(prepare+toCandidates만 다름).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareHookMaker } from "./prepare.js";
import type { HookMakerOutput } from "./schema.js";

export function hookStageSpec(runId: string): ProposalStageSpec<HookMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.title_thumb,
    prepare: (supa) => prepareHookMaker(supa, runId),
    toCandidates: (out): Candidate[] =>
      out.candidates.map((c, idx) => ({
        idx,
        payload: { title: c.title, thumbnail_layout: c.thumbnail_layout, thumbnail_copy: c.thumbnail_copy },
        reason: c.reason,
        evidence_ids: c.evidence_ids,
      })),
  };
}
