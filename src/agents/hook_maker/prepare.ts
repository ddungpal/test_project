// 훅이 결정적 prep(제목 전용) — 선택된 주제 + 말투 + 과거 제목 레퍼런스(§8.1, AI 없음).
//   ★ 썸네일 스타일 주입은 제목엔 무의미 → thumbnail_maker prepare로 이동. 여기선 title 학습만 환류.
import type { Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import { getSelectedStagePayload, getToneProfile } from "../../pipeline/context.js";
import { HOOK_MAKER_SCHEMA, HOOK_MAKER_SYSTEM, HOOK_PERSONA_DIRECTIVE, HOOK_TOPIC_CONTEXT_DIRECTIVE } from "./schema.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";
import { loadActiveTitleStyle, appendTitleStyle, loadActiveTitleOwnerRules, appendTitleOwnerRules } from "../shared/styleProfile.js";
import { gatherTitleReferences, type ExternalTitleRef } from "./externalRefs.js";

export interface HookMakerInput {
  topic: string;
  target_persona?: string; // 주제 payload에 실린 시청 대상 한 줄 — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
  topic_reason?: string; // 주제의 reason(왜/각도·evidence 내러티브) — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
  audience_need?: string; // 시청자가 지금 뭘 원하는지 — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
  audience_level?: string; // 입문/초급/중급/고급 — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
  tone: { id: string; version: number; components: unknown } | null;
  reference_titles: { id: string; text: string }[]; // 과거 완성 제목(corpus) — 톤 레퍼런스
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'title' 학습 규칙 — 있을 때만(픽스처 해시 보존)
  reference_titles_external?: ExternalTitleRef[]; // 외부 고조회 유튜브 제목 — 옵트인(TITLE_REFERENCES=youtube)·있을 때만(해시 보존)
  style_profile?: { id: string; version: number; patterns: unknown }; // active 'title' 스타일 사양 — 활성 프로필 있을 때만(없으면 부재·해시 보존)
}

export async function prepareHookMaker(supa: Supa, runId: string): Promise<{ system: string; input: HookMakerInput; schema: JsonSchema }> {
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic") as { title?: string; target_persona?: string; reason?: string; audience_need?: string; audience_level?: string } | null;
  const topic = topicPayload?.title;
  if (!topic) throw new Error("훅이 prep: 선택된 주제를 찾을 수 없음(topic 단계 미선택?).");
  const targetPersona = topicPayload?.target_persona; // target_persona: 같은 payload에서 함께 추출(별도 조회 없음 — 구다리 패턴)
  // 주제 맥락 번들 — 같은 payload에서 함께 추출(별도 조회 없음). 셋 다 있을 때만 input/system에 실린다(없으면 바이트 불변 → 픽스처 해시 보존).
  const topicReason = topicPayload?.reason;
  const audienceNeed = topicPayload?.audience_need;
  const audienceLevel = topicPayload?.audience_level;
  const hasTopicContext = Boolean(topicReason || audienceNeed || audienceLevel);

  const tone = await getToneProfile(supa);

  // 과거 완성 제목(corpus_components type=title, is_final) — 김짠부 제목 톤 레퍼런스.
  const { data: titles } = await supa
    .from("corpus_components")
    .select("id, content, is_final")
    .eq("type", "title")
    .eq("is_final", true)
    .limit(12);
  const reference_titles = (titles ?? []).map((t) => ({ id: `ref:${t.id}`, text: t.content }));

  const input: HookMakerInput = {
    topic,
    tone: tone ? { id: `tone:v${tone.version}`, version: tone.version, components: tone.components } : null,
    reference_titles,
  };

  // 환류(슬라이스 4) — 승인된 'title' 학습 규칙만 주입(썸네일 규칙은 thumbnail_maker로 이동). 있을 때만(없으면 해시 보존).
  const learned = await loadApprovedInsights(supa, ["title"]);
  if (learned.length) input.learned_insights = learned;

  // 외부 제목 레퍼런스(옵트인) — 고조회 관련 유튜브 제목. 게이트 off/실패/0이면 [] → 필드 부재(promptHash 불변·$0 보존).
  const externalRefs = await gatherTitleReferences(topic);
  if (externalRefs.length) input.reference_titles_external = externalRefs;

  // 제목 스타일 환류(copy-learning-admin step1) — active 'title' 스타일 프로필을 조건부 주입.
  //   ★ 활성 제목 프로필이 없으면(현재 상태) input/system 불변 → promptHash·hook_maker 픽스처 보존. 활성화 후에만 변동.
  const titleStyle = await loadActiveTitleStyle(supa);
  if (titleStyle) input.style_profile = { id: titleStyle.id, version: titleStyle.version, patterns: titleStyle.patterns };

  // target_persona 조건부 주입 — persona 있을 때만 input에 실음. 없으면 키 자체를 넣지 않음(바이트 불변 → 픽스처 해시 보존).
  if (targetPersona) input.target_persona = targetPersona;

  // 주제 맥락 조건부 주입 — 각 필드 있을 때만 input에 실음. 셋 다 없으면 어떤 키도 안 넣음(바이트 불변 → 픽스처 해시 보존).
  if (topicReason) input.topic_reason = topicReason;
  if (audienceNeed) input.audience_need = audienceNeed;
  if (audienceLevel) input.audience_level = audienceLevel;

  // owner-feedback-rules step2 — 김짠부 직접 피드백 최우선 규칙(active title_owner_rules). system에만 주입(input 오염 금지).
  //   ★ 활성 규칙 없으면(현재 상태) system 바이트 불변 → promptHash·hook_maker 픽스처 보존. 활성화 후에만 변동.
  const ownerRules = await loadActiveTitleOwnerRules(supa);

  // 주제 맥락 지시는 base(HOOK_MAKER_SYSTEM) 직후에 붙여 learned/style/owner/persona 체인보다 안쪽에 둔다.
  //   ★ 셋 다 없으면 base = HOOK_MAKER_SYSTEM 그대로(바이트 불변 → promptHash 보존). 말투·시그니처·스타일·owner·persona가 더 바깥(뒤)에 남아 우선순위 유지.
  const base = hasTopicContext ? HOOK_MAKER_SYSTEM + "\n" + HOOK_TOPIC_CONTEXT_DIRECTIVE : HOOK_MAKER_SYSTEM;

  // system 합성: (base) → learned_insights → title 스타일 사양 → owner 최우선 규칙 순(insights·style 뒤, persona 앞). 다 없으면 HOOK_MAKER_SYSTEM 그대로(바이트 불변).
  //   ★ 기존 appendTitleStyle/appendLearnedInsights 체인은 그대로 두고, owner 규칙을 맨 바깥 학습 래퍼로 감싼 뒤 persona 있을 때만 지시문을 붙인다.
  let system = appendTitleOwnerRules(
    appendTitleStyle(appendLearnedInsights(base, learned), titleStyle),
    ownerRules,
  );
  if (targetPersona) system += "\n" + HOOK_PERSONA_DIRECTIVE;
  return { system, input, schema: HOOK_MAKER_SCHEMA };
}
