// 구다리 결정적 prep — 선택된 주제·제목 + 구조 인사이트 + 말투(§8.1, AI 없음).
import type { Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import { getSelectedStagePayload, getToneProfile } from "../../pipeline/context.js";
import { STRUCTURER_SCHEMA, STRUCTURER_SYSTEM } from "./schema.js";
import { loadApprovedInsights } from "../shared/approvedInsights.js";
import { loadActiveStructureStyle, appendStructureStyle } from "../shared/styleProfile.js";

export interface StructurerInput {
  topic: string;
  title: string | null;
  structure_insights: { id: string; title: string | null; body: string | null }[];
  tone_easy_explain: unknown | null; // tone_profile.components.easy_explain(쉬운설명 톤)만 발췌
  structure_style_profile?: { id: string; version: number; patterns: unknown }; // PhaseA: active 구성 스타일 사양 — 있을 때만(없으면 input/system 불변)
  target_persona?: string; // target_persona: 주제 payload에 실린 시청 대상 한 줄 — 있을 때만(없으면 input 바이트 불변 → 픽스처 해시 보존)
}

export async function prepareStructurer(supa: Supa, runId: string): Promise<{ system: string; input: StructurerInput; schema: JsonSchema }> {
  const topicPayload = await getSelectedStagePayload(supa, runId, "topic") as { title?: string; target_persona?: string } | null;
  const topic = topicPayload?.title;
  if (!topic) throw new Error("구다리 prep: 선택된 주제 없음.");
  const targetPersona = topicPayload?.target_persona; // target_persona: 같은 payload에서 함께 추출(별도 조회 없음)
  const title = (await getSelectedStagePayload(supa, runId, "title_thumb") as { title?: string } | null)?.title ?? null;

  // 환류(슬라이스 4) — 승인된 'structure' 학습 규칙(공유 헬퍼로 표준화). 슬라이스 3 승인 게이트 → approved만.
  //   초기엔 비어있을 수 있음. structure_insights 필드는 항상 존재(형태 보존) → 기존 픽스처 해시 유지.
  const learned = await loadApprovedInsights(supa, ["structure"]);
  const structure_insights = learned.map((i) => ({ id: i.id, title: i.rule, body: i.detail }));

  const tone = await getToneProfile(supa);
  const comps = tone?.components as { easy_explain?: unknown } | undefined;

  const input: StructurerInput = {
    topic,
    title,
    structure_insights,
    tone_easy_explain: comps?.easy_explain ?? null,
  };

  // structure-style-learning Step1 — active 구성 스타일 사양 주입. 있을 때만(없으면 input/system 불변 → 픽스처 해시 보존).
  const structureStyle = await loadActiveStructureStyle(supa);
  if (structureStyle) input.structure_style_profile = structureStyle;

  // target_persona 조건부 주입 — persona 있을 때만 input에 실음. 없으면 키 자체를 넣지 않음(바이트 불변 → 픽스처 해시 보존).
  if (targetPersona) input.target_persona = targetPersona;

  // system 합성: structure 프로필만 SYSTEM 뒤에 붙인다. 없으면 STRUCTURER_SYSTEM 그대로(바이트 불변).
  const system = appendStructureStyle(STRUCTURER_SYSTEM, structureStyle);
  return { system, input, schema: STRUCTURER_SCHEMA };
}
