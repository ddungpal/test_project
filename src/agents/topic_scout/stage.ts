// 촉이 단계 스펙 — prepare + toCandidates를 topic 디스크립터에 묶는다.
// 이 스펙 하나를 Inngest 함수와 검증 스크립트가 동일하게 runProposalStage에 넘긴다(durable=$0 동형).

import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareTopicScout } from "./prepare.js";
import type { TopicScoutOutput } from "./schema.js";

export function topicStageSpec(runId: string, opts?: { levelSplit?: boolean }): ProposalStageSpec<TopicScoutOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.topic,
    prepare: (supa) => prepareTopicScout(supa, runId, opts),
    toCandidates: (out): Candidate[] =>
      out.candidates.map((c, idx) => ({
        idx,
        // audience_level/need를 payload에 보존 → 선택 시 저장(V2 다운스트림이 읽음)·대시보드 배지 표시.
        payload: { title: c.title, audience_level: c.audience_level, audience_need: c.audience_need },
        reason: c.reason,
        evidence_ids: c.evidence_ids,
      })),
  };
}
