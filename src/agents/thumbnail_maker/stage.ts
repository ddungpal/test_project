// 썸네일메이커 단계 스펙 — 훅이 stage.ts 미러(prepare+toCandidates만 다름).
//   ★ referenceGuard·styleConformance는 hook_maker 것을 import 재사용(중복 구현 금지).
import { STAGE_DESCRIPTORS } from "../../pipeline/stages.js";
import type { ProposalStageSpec, Candidate } from "../../pipeline/stageContract.js";
import type { Supa } from "../../pipeline/runState.js";
import { prepareThumbnailMaker, type ThumbnailMakerInput } from "./prepare.js";
import { maxReferenceSimilarity } from "../hook_maker/referenceGuard.js";
import { evaluateStyleConformance } from "../hook_maker/styleConformance.js";
import { detectTopicMissing } from "./topicMissing.js";
import type { ThumbnailStylePatterns } from "../style_extractor/schema.js";
import type { ThumbnailMakerOutput } from "./schema.js";
import { loadActiveThumbnailStyle } from "../shared/styleProfile.js";
import { buildLocalGenContext, fillThumbnailSkeletons } from "../shared/localCopyGen.js";

// 로컬 생성 시 스켈레톤엔 레이아웃 정보가 없을 때의 결정적 기본 레이아웃(thumbnail_layout 필수 충족용).
const DEFAULT_THUMBNAIL_LAYOUT = "인물 우측·상단 메인카피 2줄·하단 박스 2개";

/** 검증된 출력 → 썸네일 후보. 로컬 생성도 이 함수를 재사용해 payload 동형(thumbnail_copy·ref_similarity·style_conformance)을 강제한다. */
function thumbnailToCandidates(out: ThumbnailMakerOutput, input?: unknown): Candidate[] {
  // prepare가 만든 reference_thumbnail_copies(있을 때만) — 베껴쓰기 가드용. input 없이 호출돼도 안전(빈 배열).
  const references = ((input as ThumbnailMakerInput | undefined)?.reference_thumbnail_copies ?? []).map((r) => r.text);
  // PhaseA active 스타일 패턴(있을 때만) — banned·emphasis_words로 사후 부합도 검사. LLM/로컬 생성 후 변환 → promptHash 무관.
  const stylePatterns = (input as ThumbnailMakerInput | undefined)?.style_profile?.patterns as ThumbnailStylePatterns | undefined;
  // 주제 키워드 누락 소프트 경고용 — input의 topic·selected_title. input 없으면 ""(detectTopicMissing이 중립 반환).
  const topic = (input as ThumbnailMakerInput | undefined)?.topic ?? "";
  const selectedTitle = (input as ThumbnailMakerInput | undefined)?.selected_title ?? "";
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
        // topic_missing(옵셔널 주석): 메인문구에 주제 핵심 키워드 누락 시 ⚠ 표면화. ref_similarity·style_conformance와
        //   동일하게 생성 후 부착 → promptHash 무관. 스키마/계약 불변(표시 전용·강제 거부 아님).
        topic_missing: detectTopicMissing(c.thumbnail_main, topic, selectedTitle),
      },
      reason: c.reason,
      evidence_ids: c.evidence_ids,
    };
  });
}

export function thumbnailStageSpec(runId: string): ProposalStageSpec<ThumbnailMakerOutput> {
  return {
    runId,
    descriptor: STAGE_DESCRIPTORS.thumbnail,
    prepare: (supa) => prepareThumbnailMaker(supa, runId),
    toCandidates: thumbnailToCandidates,
    // 로컬 생성(copy-local-gen): 활성 'thumbnail' 스켈레톤을 런 주제로 채워 LLM 없이 후보 생성($0).
    //   스타일/스켈레톤 없거나 후보 0이면 null → callLLM 폴백. payload는 thumbnailToCandidates 재사용으로 동형 보장.
    localCandidates: async (supa: Supa, prep: { input: unknown }, ctx: { offset: number }): Promise<Candidate[] | null> => {
      const style = await loadActiveThumbnailStyle(supa);
      const patterns = style?.patterns as ThumbnailStylePatterns | undefined;
      const sk = patterns?.skeletons?.thumbnail;
      if (!style || !sk || !sk.length) return null;
      const input = prep.input as ThumbnailMakerInput;
      const genCtx = buildLocalGenContext(input.topic);
      const filled = fillThumbnailSkeletons(sk, genCtx, { count: 3, offset: ctx.offset, banned: patterns.banned });
      // 정확히 3개(A/B/C)를 못 채우면(스켈레톤 부족·banned 필터로 일부 탈락) LLM 폴백 — 부분 세트(2개 등) 누출 방지.
      //   schema가 candidates 정확히 3개를 요구하므로, 로컬은 풀세트를 만들 때만 단락한다.
      if (filled.length < 3) return null;
      // 스켈레톤엔 레이아웃이 없으므로 활성 스타일의 첫 레이아웃 아키타입, 없으면 결정적 기본값 사용.
      const layout = patterns?.visual?.layout_archetypes?.[0] ?? DEFAULT_THUMBNAIL_LAYOUT;
      const out: ThumbnailMakerOutput = {
        candidates: filled.map((f) => ({
          thumbnail_layout: layout,
          thumbnail_main: f.copy_main,
          thumbnail_boxes: f.copy_boxes,
          reason: "로컬 스켈레톤 생성",
          evidence_ids: [style.id, "skeleton"],
        })),
      };
      return thumbnailToCandidates(out, input);
    },
  };
}
