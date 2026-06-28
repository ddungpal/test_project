"use server";
// 단독 실행(standalone) Server Action(§8.2: 버튼 → ServerAction → DB저장 → 이벤트 발행).
//   목표 단계의 enters까지 임시 run을 결정적으로 시드(seedStandaloneRun, AI 0회) → 목표 단계만 평소처럼
//   Inngest로 발사(정상 forward, force 없음). topicRun.startTopicRun 패턴 미러.
// ★ requireOwner()로 owner 검증 후에만 service-role 사용(코드리뷰 P0).

import { createAdminClient } from "../../lib/supabase/admin.js";
import { inngest } from "../../inngest/client.js";
import { seedStandaloneRun } from "../../pipeline/standalone/seed.js";
import { requireOwner } from "./auth.js";
import type { Stage } from "../../domain/enums.js";

// 목표 단계 → 발사할 Inngest 이벤트(등록된 함수가 실제 듣는 이름).
//   ⚠ PIPELINE[title_thumb].event는 stale "run/title.requested"라 쓰지 않는다 — 등록 함수는
//     "run/titles.requested"를 듣는다(topicRun.requestTitles 미러). 그 외는 PIPELINE.event와 동일.
const STANDALONE_EVENT = {
  topic: "run/topic.requested",
  title_thumb: "run/titles.requested",
  thumbnail: "run/thumbnails.requested",
  structure: "run/structure.requested",
  research: "run/research.requested",
  script: "run/script.requested",
} as const satisfies Record<Stage, string>;

export async function runStandalone(
  target: Stage,
  rawInputs: Record<string, string>,
): Promise<{ runId: string }> {
  await requireOwner();
  const supa = createAdminClient();

  const runId = await seedStandaloneRun(supa, target, rawInputs);

  // 결정적 시드 끝 → 목표 단계만 정상 forward 이벤트로 발사(force 없음 — enters에서 정상 진입).
  await inngest.send({ name: STANDALONE_EVENT[target], data: { runId } });
  return { runId };
}
