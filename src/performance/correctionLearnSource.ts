// 교정쌍 학습 입력 구성(thumbnail-correction-learning step2) — thumbnail_corrections 의 교정쌍을
//   합성 A/B(이상=winner, 생성=loser)로 변환해 기존 학습 본체(learnAbStylePatterns)에 합류시킨다.
//   ★ 출력은 learn-ab-style 의 AbResultVideo[] 형태(abLearnSource 미러·드리프트 차단).
//   ★ CTR 없음·사람 명시 선호 → learn_mode="correction"(buildAbStyleInput 에서 decisive 고정 가중·judgeComponent 안 탐).
//   ★ payload→카피 변환은 abLearnSource.payloadToVariantFields 재사용(ab_variants 와 동일 모양 — 재구현 금지).
//   ★ learned/unlearned 모두 로드(abLearnSource 가 ab_variants 전부 읽는 것과 동일) — 멱등은 styleRelearn 의 learned_at 스탬프가 담당.

import type { Supa } from "../pipeline/runState.js";
import type { AbComponent, AbVariantKey } from "./types.js";
import type { AbResultVideo, AbResultVariant } from "../../scripts/learn-ab-style.js";
import { payloadToVariantFields } from "./abLearnSource.js";

/** thumbnail_corrections.component_type 값(DB). title 그대로, thumbnail 은 thumbnail. */
function dbComponent(component: AbComponent): "title" | "thumbnail" {
  return component === "title" ? "title" : "thumbnail";
}

interface CorrectionRow {
  id: string;
  topic: string | null;
  gen_payload: unknown;
  ideal_payload: unknown;
}

/**
 * thumbnail_corrections → 학습 입력(AbResultVideo[]). 각 교정쌍 1행을 합성 A/B 영상 1편으로 변환한다.
 *   - winner = ideal_payload(김짠부 이상), loser = gen_payload(AI 생성). 변형 2개.
 *   - learn_mode="correction" → buildAbStyleInput 이 decisive 고정 가중(CTR·결정력 무관).
 *   - learned/unlearned 모두 로드(멱등은 learned_at 스탬프 담당, abLearnSource 미러).
 *   - 교정 0건이면 [](하위호환 — styleRelearnSweep 기존 동작 불변).
 */
export async function loadCorrectionResults(supa: Supa, component: AbComponent): Promise<AbResultVideo[]> {
  const ct = dbComponent(component);

  const { data, error } = await supa
    .from("thumbnail_corrections")
    .select("id, topic, gen_payload, ideal_payload")
    .eq("component_type", ct);
  if (error) throw new Error(`thumbnail_corrections(${ct}) 조회 실패: ${error.message}`);

  const rows = (data ?? []) as CorrectionRow[];
  if (rows.length === 0) return [];

  const out: AbResultVideo[] = [];
  for (const row of rows) {
    // A = 이상(winner), B = 생성(loser). payload 모양은 ab_variants 와 동일 → payloadToVariantFields 재사용.
    const variants: AbResultVariant[] = [
      { variant: "A" as AbVariantKey, is_winner: true, ...payloadToVariantFields(row.ideal_payload, component) },
      { variant: "B" as AbVariantKey, is_winner: false, ...payloadToVariantFields(row.gen_payload, component) },
    ];
    // CTR/views 는 교정에 없음 → 키 자체 미설정(exactOptionalPropertyTypes — undefined 명시 대입 금지).
    out.push({
      topic: row.topic ?? "(교정)",
      learn_mode: "correction",
      variants,
    });
  }
  return out;
}
