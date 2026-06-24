// 훅이 결정적 prep(제목 전용) — 선택된 주제 + 말투 + 과거 제목 레퍼런스(§8.1, AI 없음).
//   ★ 썸네일 스타일 주입은 제목엔 무의미 → thumbnail_maker prepare로 이동. 여기선 title 학습만 환류.
import type { Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import { getSelectedStagePayload, getToneProfile } from "../../pipeline/context.js";
import { HOOK_MAKER_SCHEMA, HOOK_MAKER_SYSTEM } from "./schema.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";

export interface HookMakerInput {
  topic: string;
  tone: { id: string; version: number; components: unknown } | null;
  reference_titles: { id: string; text: string }[]; // 과거 완성 제목(corpus) — 톤 레퍼런스
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'title' 학습 규칙 — 있을 때만(픽스처 해시 보존)
}

export async function prepareHookMaker(supa: Supa, runId: string): Promise<{ system: string; input: HookMakerInput; schema: JsonSchema }> {
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic");
  const topic = (topicPayload as { title?: string } | null)?.title;
  if (!topic) throw new Error("훅이 prep: 선택된 주제를 찾을 수 없음(topic 단계 미선택?).");

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

  // system 합성: learned_insights만. 없으면 HOOK_MAKER_SYSTEM 그대로(바이트 불변).
  const system = appendLearnedInsights(HOOK_MAKER_SYSTEM, learned);
  return { system, input, schema: HOOK_MAKER_SCHEMA };
}
