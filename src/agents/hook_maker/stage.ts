// 훅이 단계 스펙 — spine 복붙(prepare+toCandidates만 다름).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import { prepareHookMaker, type HookMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "./referenceGuard.js";
import { evaluateStyleConformance } from "./styleConformance.js";
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";
import type { HookMakerOutput } from "./schema.js";

export function hookStageSpec(runId: string): ProposalStageSpec<HookMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.title_thumb,
    prepare: (supa) => prepareHookMaker(supa, runId),
    toCandidates: (out, input): Candidate[] => {
      // prepare가 만든 reference_titles(있을 때만) — 유사도 가드용. input 없이 호출돼도 안전(빈 배열).
      const references = ((input as HookMakerInput | undefined)?.reference_titles ?? []).map((r) => r.text);
      // PhaseA active 스타일 패턴(있을 때만) — banned·emphasis_words로 사후 부합도 검사. ref_similarity와 동일 위치(LLM 호출 후 변환 → promptHash 무관).
      const stylePatterns = (input as HookMakerInput | undefined)?.style_profile?.patterns as ThumbnailStylePatterns | undefined;
      return out.candidates.map((c, idx) => ({
        idx,
        payload: {
          title: c.title,
          thumbnail_layout: c.thumbnail_layout,
          thumbnail_main: c.thumbnail_main,
          thumbnail_boxes: c.thumbnail_boxes,
          // 파생·back-compat: summarizeChoicePayload·retrospective가 단일 문자열을 읽는다 — 절대 없애지 마라.
          thumbnail_copy: [...c.thumbnail_main, ...c.thumbnail_boxes].filter(Boolean).join("\n"),
          ref_similarity: maxReferenceSimilarity(c.title, references),
          style_conformance: evaluateStyleConformance([c.title, c.thumbnail_main.join(" ")].join(" "), stylePatterns),
        },
        reason: c.reason,
        evidence_ids: c.evidence_ids,
      }));
    },
  };
}
