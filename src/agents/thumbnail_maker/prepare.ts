// 썸네일메이커 결정적 prep — 선택된 주제 + '선택된 제목' + 말투 + 레퍼런스 + active 썸네일 스타일(§8.1, AI 없음).
//   ★ 훅이 prepare 미러. 다른 점: '선택된 제목'을 명시 입력으로 넣고, 썸네일 스타일을 여기서 주입한다.
import type { Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import { getSelectedStagePayload, getToneProfile } from "../../pipeline/context.js";
import { THUMBNAIL_MAKER_SCHEMA, THUMBNAIL_MAKER_SYSTEM } from "./schema.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";
import { loadActiveThumbnailStyle, appendThumbnailStyle, type ActiveThumbnailStyle } from "../shared/styleProfile.js";
import { gatherTitleReferences, type ExternalTitleRef } from "../hook_maker/externalRefs.js";

export interface ThumbnailMakerInput {
  topic: string;
  selected_title: string; // 훅이 단계에서 김짠부가 확정한 제목 — 썸네일은 이 제목을 강화한다
  tone: { id: string; version: number; components: unknown } | null;
  reference_thumbnail_copies: { id: string; text: string }[]; // 김짠부 과거 썸네일 문구(corpus type=thumbnail_copy) — 톤 레퍼런스
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'thumbnail' 학습 규칙 — 있을 때만(픽스처 해시 보존)
  style_profile?: ActiveThumbnailStyle; // PhaseA: active 썸네일 스타일 사양 — 있을 때만(없으면 해시 불변)
  reference_titles_external?: ExternalTitleRef[]; // 외부 고조회 유튜브 제목 — 옵트인(TITLE_REFERENCES=youtube)·있을 때만(해시 보존)
}

export async function prepareThumbnailMaker(supa: Supa, runId: string): Promise<{ system: string; input: ThumbnailMakerInput; schema: JsonSchema }> {
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic");
  const topic = (topicPayload as { title?: string } | null)?.title;
  if (!topic) throw new Error("썸네일메이커 prep: 선택된 주제를 찾을 수 없음(topic 단계 미선택?).");

  // 선택된 제목(title_thumb 단계 = 제목 전용) — edited 우선은 getSelectedStagePayload가 처리. 정상 흐름은 titles_selected 이후.
  const titlePayload = await getSelectedStagePayload(supa, runId, "title_thumb");
  const selected_title = (titlePayload as { title?: string } | null)?.title;
  if (!selected_title) throw new Error("썸네일메이커 prep: 선택된 제목을 찾을 수 없음(title_thumb 단계 미선택?).");

  const tone = await getToneProfile(supa);

  // 김짠부 과거 썸네일 문구(corpus_components type=thumbnail_copy, is_final) — 썸네일 톤 레퍼런스.
  const { data: copies } = await supa
    .from("corpus_components")
    .select("id, content, is_final")
    .eq("type", "thumbnail_copy")
    .eq("is_final", true)
    .limit(12);
  const reference_thumbnail_copies = (copies ?? []).map((t) => ({ id: `ref:${t.id}`, text: t.content }));

  const input: ThumbnailMakerInput = {
    topic,
    selected_title,
    tone: tone ? { id: `tone:v${tone.version}`, version: tone.version, components: tone.components } : null,
    reference_thumbnail_copies,
  };

  // 환류(슬라이스 4) — 승인된 'thumbnail' 학습 규칙을 주입. 있을 때만(없으면 기존 해시 보존).
  const learned = await loadApprovedInsights(supa, ["thumbnail"]);
  if (learned.length) input.learned_insights = learned;

  // PhaseA Step1 — active 썸네일 스타일 사양 주입. 있을 때만(없으면 input/system 불변 → 픽스처 해시 보존).
  const style = await loadActiveThumbnailStyle(supa);
  if (style) input.style_profile = style;

  // 외부 제목 레퍼런스(옵트인) — 고조회 관련 유튜브 제목의 후킹 각도 참고용. 게이트 off/실패/0이면 [] → 필드 부재(promptHash 불변·$0 보존).
  const externalRefs = await gatherTitleReferences(topic);
  if (externalRefs.length) input.reference_titles_external = externalRefs;

  // system 합성: learned_insights → style_profile 순. 둘 다 없으면 THUMBNAIL_MAKER_SYSTEM 그대로(바이트 불변).
  const system = appendThumbnailStyle(appendLearnedInsights(THUMBNAIL_MAKER_SYSTEM, learned), style);
  return { system, input, schema: THUMBNAIL_MAKER_SCHEMA };
}
