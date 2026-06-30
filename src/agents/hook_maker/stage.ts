// 훅이 단계 스펙(제목 전용) — spine 복붙(prepare+toCandidates만 다름).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import type { Supa } from "../../pipeline/runState.js";
import { prepareHookMaker, type HookMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "./referenceGuard.js";
import { detectTitleSignatureMissing } from "./titleSignature.js";
import type { HookMakerOutput } from "./schema.js";
import { loadActiveTitleStyle } from "../shared/styleProfile.js";
import { buildLocalGenContext, fillTitleSkeletons } from "../shared/localCopyGen.js";
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";

/** 검증된 출력 → 제목 후보. 로컬 생성도 이 함수를 재사용해 payload 동형(idx·ref_similarity)을 강제한다. */
function hookToCandidates(out: HookMakerOutput, input?: unknown): Candidate[] {
  // prepare가 만든 reference_titles(있을 때만) — 유사도 가드용. input 없이 호출돼도 안전(빈 배열).
  const references = ((input as HookMakerInput | undefined)?.reference_titles ?? []).map((r) => r.text);
  // PhaseA active 제목 스타일 패턴(있을 때만) — signature_words·skeleton 고정어구로 사후 시그니처 누락 검사.
  //   prepare가 loadActiveTitleStyle로 로드해 input.style_profile.patterns로 전달. 없으면 undefined → 중립.
  const stylePatterns = (input as HookMakerInput | undefined)?.style_profile?.patterns;
  return out.candidates.map((c, idx) => ({
    idx,
    payload: {
      title: c.title,
      // 제목도 레퍼런스를 통째로 베끼면 안 됨 — ref_similarity 유지(LLM/로컬 생성 후 변환 → promptHash 무관).
      ref_similarity: maxReferenceSimilarity(c.title, references),
      // signature_missing(옵셔널 주석): 제목이 김짠부 시그니처 고정어구를 하나도 안 쓰면 ⚠ 표면화. ref_similarity와
      //   동일하게 생성 후 부착 → promptHash 무관. 표시 전용·강제 거부 아님(시그니처 데이터 없으면 중립).
      signature_missing: detectTitleSignatureMissing(c.title, stylePatterns),
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
      // 정확히 3개(A/B/C)를 못 채우면 LLM 폴백 — schema가 3개를 요구하므로 부분 세트 누출 방지(썸네일 동일 규칙).
      if (filled.length < 3) return null;
      const out: HookMakerOutput = {
        candidates: filled.map((f) => ({ title: f.title, reason: "로컬 스켈레톤 생성", evidence_ids: [style.id, "skeleton"] })),
      };
      return hookToCandidates(out, input);
    },
  };
}
