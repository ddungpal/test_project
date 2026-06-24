// 썸네일메이커 단계 스펙 — 훅이 stage.ts 미러(prepare+toCandidates만 다름).
//   ★ referenceGuard·styleConformance는 hook_maker 것을 import 재사용(중복 구현 금지).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareThumbnailMaker, type ThumbnailMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "../hook_maker/referenceGuard.js";
import { evaluateStyleConformance } from "../hook_maker/styleConformance.js";
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";
import type { ThumbnailMakerOutput } from "./schema.js";

export function thumbnailStageSpec(runId: string): ProposalStageSpec<ThumbnailMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.thumbnail,
    prepare: (supa) => prepareThumbnailMaker(supa, runId),
    toCandidates: (out, input): Candidate[] => {
      // prepare가 만든 reference_titles(있을 때만) — 유사도 가드용. input 없이 호출돼도 안전(빈 배열).
      const references = ((input as ThumbnailMakerInput | undefined)?.reference_titles ?? []).map((r) => r.text);
      // PhaseA active 스타일 패턴(있을 때만) — banned·emphasis_words로 사후 부합도 검사. LLM 호출 후 변환 → promptHash 무관.
      const stylePatterns = (input as ThumbnailMakerInput | undefined)?.style_profile?.patterns as ThumbnailStylePatterns | undefined;
      // 후보가 3개 미만이어도 map은 안전(크래시 없음).
      return out.candidates.map((c, idx) => {
        // ref_similarity: 썸네일 main을 join해 references와 비교(title 베낌 대신 카피 베낌 측정).
        const mainJoined = c.thumbnail_main.join(" ");
        return {
          idx,
          payload: {
            thumbnail_main: c.thumbnail_main,
            thumbnail_boxes: c.thumbnail_boxes,
            thumbnail_layout: c.thumbnail_layout,
            // 파생·back-compat: summarizeChoicePayload·retrospective가 단일 문자열을 읽는다 — 절대 없애지 마라.
            thumbnail_copy: [...c.thumbnail_main, ...c.thumbnail_boxes].filter(Boolean).join("\n"),
            ref_similarity: maxReferenceSimilarity(mainJoined, references),
            style_conformance: evaluateStyleConformance([mainJoined, c.thumbnail_boxes.join(" ")].join(" "), stylePatterns),
          },
          reason: c.reason,
          evidence_ids: c.evidence_ids,
        };
      });
    },
  };
}
