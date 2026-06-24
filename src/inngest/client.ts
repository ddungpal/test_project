// Inngest 클라이언트 — durable 파이프라인의 이벤트 버스(tech.md §8.3).
// 버튼/시스템 → 이벤트 발행 → 함수가 step.run으로 멱등 실행. 클라이언트 연결과 분리(재연결 $0).
//
// 이벤트 명명: "run/<stage>.<verb>" — requested=단계 시작(AI 돈 쓰기 시작점, §8.2), selected=사람 게이트 통과.

import { Inngest, EventSchemas } from "inngest";

// 단계 경계 이벤트 스키마(§8.2: 버튼=단계경계/사람게이트). data는 최소(runId)만 — 진실은 DB.
// softAck: SOFT 비용캡 일시정지 후 사람이 승인하고 재개할 때 true(반장 마감).
// levelSplit: 촉이 수준 분해 모드(키워드를 시청자 수준별로 나눠 제안) — topic.requested에서만 사용.
// force: '다시 생성' — 멱등 메모이즈를 우회해 proposedState에서 새 제안을 INSERT(상태 전이 없음).
type StageData = { runId: string; softAck?: boolean; levelSplit?: boolean; force?: boolean };
type PipelineEvents = {
  "run/topic.requested": { data: StageData };
  "run/titles.requested": { data: StageData };
  "run/structure.requested": { data: StageData };
  "run/research.requested": { data: StageData }; // 셜록 셀(fan-out/join)
  "run/script.requested": { data: StageData }; // 짠펜(최종 합류)
  // 발굴 신선도(B): 매일 cron 외에 수동 트리거(개발 검증·"발굴 새로고침" 버튼)도 같은 함수로.
  "discovery/refresh.requested": { data: Record<string, never> };
  // 운영 자동화(①): 성과가 적재되면 발행(수집 Cron/스크립트) → 회고 sweep을 깨운다. contentId는 최적화용(없으면 전체 sweep).
  "performance/collected": { data: { contentId?: string } };
  // 회고 sweep 수동 트리거(개발 검증·운영 보정).
  "retro/sweep.requested": { data: Record<string, never> };
  // 성과 수집 수동 트리거(개발 검증·운영 보정). 실수집은 PERFORMANCE_SOURCE=youtube + OAuth.
  "performance/collect.requested": { data: Record<string, never> };
};

export const inngest = new Inngest({
  id: "produce-script",
  schemas: new EventSchemas().fromRecord<PipelineEvents>(),
});
