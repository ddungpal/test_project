// 썸네일메이커 결정적 prep — 선택된 주제 + '선택된 제목' + 말투 + 레퍼런스 + active 썸네일 스타일(§8.1, AI 없음).
//   ★ 훅이 prepare 미러. 다른 점: '선택된 제목'을 명시 입력으로 넣고, 썸네일 스타일을 여기서 주입한다.
import type { Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import { getSelectedStagePayload, getToneProfile } from "../../pipeline/context.js";
import { THUMBNAIL_MAKER_SCHEMA, THUMBNAIL_MAKER_SYSTEM, THUMBNAIL_PERSONA_DIRECTIVE } from "./schema.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";
import { loadActiveThumbnailStyle, appendThumbnailStyle, appendWinningThumbnailRefs, loadActiveThumbnailOwnerRules, appendThumbnailOwnerRules, type ActiveThumbnailStyle } from "../shared/styleProfile.js";
import { gatherTitleReferences, type ExternalTitleRef } from "../hook_maker/externalRefs.js";
import { loadWinningThumbnailRefs } from "./winningRefs.js";

export interface ThumbnailMakerInput {
  topic: string;
  target_persona?: string; // 주제 payload에 실린 시청 대상 한 줄 — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
  selected_title: string; // 훅이 단계에서 김짠부가 확정한 제목 — 썸네일은 이 제목을 강화한다
  tone: { id: string; version: number; components: unknown } | null;
  reference_thumbnail_copies: { id: string; text: string }[]; // 김짠부 과거 썸네일 문구(corpus type=thumbnail_copy) — 톤 레퍼런스
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'thumbnail' 학습 규칙 — 있을 때만(픽스처 해시 보존)
  style_profile?: ActiveThumbnailStyle; // PhaseA: active 썸네일 스타일 사양 — 있을 때만(없으면 해시 불변)
  reference_titles_external?: ExternalTitleRef[]; // 외부 고조회 유튜브 제목 — 옵트인(TITLE_REFERENCES=youtube)·있을 때만(해시 보존)
  reference_winning_thumbnails?: { id: string; topic: string; main: string[]; boxes: string[] }[];
  // 김짠부 실제 고성과 우승 썸네일(ab_variants 성과순 top N) — few-shot. 있을 때만(없으면 promptHash 불변).
}

export async function prepareThumbnailMaker(supa: Supa, runId: string): Promise<{ system: string; input: ThumbnailMakerInput; schema: JsonSchema }> {
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic") as { title?: string; target_persona?: string } | null;
  const topic = topicPayload?.title;
  if (!topic) throw new Error("썸네일메이커 prep: 선택된 주제를 찾을 수 없음(topic 단계 미선택?).");
  const targetPersona = topicPayload?.target_persona; // target_persona: 같은 payload에서 함께 추출(별도 조회 없음 — 훅이 패턴)

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

  // thumbnail-winning-refs step1 — 김짠부 실제 고성과 우승 썸네일 few-shot 주입. 있을 때만(0건이면 input/system 불변 → promptHash 보존).
  const winningRefs = await loadWinningThumbnailRefs(supa);
  if (winningRefs.length) input.reference_winning_thumbnails = winningRefs;

  // target_persona 조건부 주입 — persona 있을 때만 input에 실음. 없으면 키 자체를 넣지 않음(바이트 불변 → 픽스처 해시 보존).
  if (targetPersona) input.target_persona = targetPersona;

  // owner-feedback-rules step2 — 김짠부 직접 피드백 최우선 규칙(active thumbnail_owner_rules). system에만 주입(input 오염 금지).
  //   ★ 활성 규칙 없으면(현재 상태) system 바이트 불변 → promptHash·thumbnail 픽스처 보존. 활성화 후에만 변동.
  const ownerRules = await loadActiveThumbnailOwnerRules(supa);

  // system 합성: learned_insights → style_profile → winning_refs → owner 최우선 규칙 순(학습 뒤, persona 앞). 다 없으면 THUMBNAIL_MAKER_SYSTEM 그대로(바이트 불변).
  //   ★ 기존 winning refs 체인은 순서·동작 그대로 두고, owner 규칙을 맨 바깥 학습 래퍼로 감싼 뒤 persona 있을 때만 지시문을 붙인다(훅이 prepare 미러).
  let system = appendThumbnailOwnerRules(
    appendWinningThumbnailRefs(appendThumbnailStyle(appendLearnedInsights(THUMBNAIL_MAKER_SYSTEM, learned), style), winningRefs),
    ownerRules,
  );
  if (targetPersona) system += "\n" + THUMBNAIL_PERSONA_DIRECTIVE;
  return { system, input, schema: THUMBNAIL_MAKER_SCHEMA };
}
