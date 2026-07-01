// Inngest 클라이언트 — durable 파이프라인의 이벤트 버스(tech.md §8.3).
// 버튼/시스템 → 이벤트 발행 → 함수가 step.run으로 멱등 실행. 클라이언트 연결과 분리(재연결 $0).
//
// 이벤트 명명: "run/<stage>.<verb>" — requested=단계 시작(AI 돈 쓰기 시작점, §8.2), selected=사람 게이트 통과.

import { Inngest, EventSchemas } from "inngest";

// 단계 경계 이벤트 스키마(§8.2: 버튼=단계경계/사람게이트). data는 최소(runId)만 — 진실은 DB.
// softAck: SOFT 비용캡 일시정지 후 사람이 승인하고 재개할 때 true(반장 마감).
// levelSplit: 촉이 수준 분해 모드(키워드를 시청자 수준별로 나눠 제안) — topic.requested에서만 사용.
// force: '다시 생성' — 멱등 메모이즈를 우회해 proposedState에서 새 제안을 INSERT(상태 전이 없음).
// reason: '다시 생성' 시 사용자가 적은 선택적 이유(transient·프롬프트용, DB 미저장). 없으면 기존과 동일.
// forceLlm: 'LLM으로 새로 써줘' — 로컬($0) 생성을 건너뛰고 callLLM 강제(step2 계약, step3 UI에서 전달). 없으면 hybrid 기본.
// postConfirm: 확정 후 재생성 — 상태 전이 없이 새 proposal만 INSERT(selectedState에서도 진입, 낙관잠금 없음).
// fromStep: 리서치 부분 재진입(migration 28) — 'examples'면 셈이·유이만 재생성(②③⑦·research_facts 보존). 없으면 'full'(현행). research.requested에서만 사용.
type StageData = { runId: string; softAck?: boolean; levelSplit?: boolean; force?: boolean; reason?: string; forceLlm?: boolean; postConfirm?: boolean; fromStep?: "full" | "examples" };
type PipelineEvents = {
  "run/topic.requested": { data: StageData };
  "run/titles.requested": { data: StageData };
  "run/thumbnails.requested": { data: StageData }; // 썸네일메이커(선택된 제목 → 썸네일 3개)
  // 썸네일 슬롯 1개 재생성(3칸 중 slotIdx만 교체·나머지 보존) — 무전이 in-place(thumbnails_proposed 유지).
  "run/thumbnail-slot.requested": { data: { runId: string; slotIdx: number; softAck?: boolean; reason?: string } };
  "run/structure.requested": { data: StageData };
  "run/research.requested": { data: StageData }; // 셜록 셀(fan-out/join)
  "run/onboarding.requested": { data: StageData }; // 쏙이 궁금증 아크(온디맨드·게이트 아님·force로 재생성)
  "run/script.requested": { data: StageData }; // 짠펜(최종 합류)
  // 발굴 신선도(B): 매일 cron 외에 수동 트리거(개발 검증·"발굴 새로고침" 버튼)도 같은 함수로.
  "discovery/refresh.requested": { data: Record<string, never> };
  // 운영 자동화(①): 성과가 적재되면 발행(수집 Cron/스크립트) → 회고 sweep을 깨운다. contentId는 최적화용(없으면 전체 sweep).
  "performance/collected": { data: { contentId?: string } };
  // 회고 sweep 수동 트리거(개발 검증·운영 보정).
  "retro/sweep.requested": { data: Record<string, never> };
  // A/B 스타일 재학습 sweep 수동 트리거(개발 검증·운영 보정) — 표본 증가분을 재학습 draft 로(activate 는 사람).
  "style/relearn.requested": { data: Record<string, never> };
  // 성과 수집 수동 트리거(개발 검증·운영 보정). 실수집은 PERFORMANCE_SOURCE=youtube + OAuth.
  "performance/collect.requested": { data: Record<string, never> };
};

export const inngest = new Inngest({
  id: "produce-script",
  schemas: new EventSchemas().fromRecord<PipelineEvents>(),
});
