// 훅이 단계 스펙(제목 전용) — spine 복붙(prepare+toCandidates만 다름).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import type { Supa } from "../../pipeline/runState.js";
import { prepareHookMaker, type HookMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "./referenceGuard.js";
import type { HookMakerOutput } from "./schema.js";
import { loadActiveTitleStyle } from "../shared/styleProfile.js";
import { buildLocalGenContext, fillTitleSkeletons } from "../shared/localCopyGen.js";
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";

/** 검증된 출력 → 제목 후보. 로컬 생성도 이 함수를 재사용해 payload 동형(idx·ref_similarity)을 강제한다. */
function hookToCandidates(out: HookMakerOutput, input?: unknown): Candidate[] {
  // prepare가 만든 reference_titles(있을 때만) — 유사도 가드용. input 없이 호출돼도 안전(빈 배열).
  const references = ((input as HookMakerInput | undefined)?.reference_titles ?? []).map((r) => r.text);
  return out.candidates.map((c, idx) => ({
    idx,
    payload: {
      title: c.title,
      // 제목도 레퍼런스를 통째로 베끼면 안 됨 — ref_similarity 유지(LLM/로컬 생성 후 변환 → promptHash 무관).
      ref_similarity: maxReferenceSimilarity(c.title, references),
    },
    reason: c.reason,
    evidence_ids: c.evidence_ids,
  }));
}

export function hookStageSpec(runId: string): ProposalStageSpec<HookMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.title_thumb,
    prepare: (supa) => prepareHookMaker(supa, runId),
    toCandidates: hookToCandidates,
    // 로컬 생성(copy-local-gen): 활성 'title' 스켈레톤을 런 주제로 채워 LLM 없이 후보 생성($0).
    //   스타일/스켈레톤 없거나 후보 0이면 null → callLLM 폴백. payload는 hookToCandidates 재사용으로 동형 보장.
    localCandidates: async (supa: Supa, prep: { input: unknown }, ctx: { offset: number }): Promise<Candidate[] | null> => {
      const style = await loadActiveTitleStyle(supa);
      const patterns = style?.patterns as ThumbnailStylePatterns | undefined;
      const sk = patterns?.skeletons?.title;
      if (!style || !sk || !sk.length) return null;
      const input = prep.input as HookMakerInput;
      // title 단계엔 아직 리서치 사실이 없음 — topic만으로 컨텍스트 구성.
      const genCtx = buildLocalGenContext(input.topic);
      const filled = fillTitleSkeletons(sk, genCtx, { count: 3, offset: ctx.offset, banned: patterns.banned });
      if (!filled.length) return null;
      const out: HookMakerOutput = {
        candidates: filled.map((f) => ({ title: f.title, reason: "로컬 스켈레톤 생성", evidence_ids: [style.id, "skeleton"] })),
      };
      return hookToCandidates(out, input);
    },
  };
}
