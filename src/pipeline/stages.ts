// 단계 디스크립터 레지스트리 — 각 에이전트 단계의 상태 계약(§8 상태머신·§8.1 단계계약).
// 모든 제안 단계는 동일 골격을 따르므로(stageContract.runProposalStage), 차이는 이 표의 값뿐이다.
//   fromState   = 이 단계를 돌리기 전 run이 있어야 하는 상태(버튼 활성 조건, §8.2 버튼상태=DB파생)
//   proposedState = AI 제안 저장 후 전이할 상태
//   selectedState = 사람이 컨펌(선택) 후 전이할 상태(§8.1 컨펌=상태전환만)

import type { RunState, Stage } from "../domain/enums.js";

export interface StageDescriptor {
  stage: Stage;
  roleId: string;
  fromState: RunState;
  proposedState: RunState;
  selectedState: RunState;
}

export const STAGE_DESCRIPTORS = {
  topic: {
    stage: "topic",
    roleId: "topic_scout",
    fromState: "created",
    proposedState: "topic_proposed",
    selectedState: "topic_selected",
  },
  title_thumb: {
    stage: "title_thumb",
    roleId: "hook_maker",
    fromState: "topic_selected",
    proposedState: "titles_proposed",
    selectedState: "titles_selected",
  },
  structure: {
    stage: "structure",
    roleId: "structurer",
    fromState: "titles_selected",
    proposedState: "structure_proposed",
    selectedState: "structure_selected",
  },
  // research·script는 제안단계가 아니라 셀(fan-out/join·합류) — proposedState/selectedState 의미가 없어 여기 없음.
  //   대신 아래 PIPELINE 레지스트리에 5단계 전체가 모양(shape)과 함께 한 표로 선언된다.
} as const satisfies Record<string, StageDescriptor>;

export type ProposalStageKey = keyof typeof STAGE_DESCRIPTORS;

// ── 통합 파이프라인 레지스트리 ──────────────────────────────────────────────
// 5단계 전체를 한 표에. 제안단계(linear)와 셀(fanout/join)이 같은 기반(stageRuntime) 위에 선다.
//   shape   = 실행 모양. linear=제안계약 1콜 · fanout=병렬+리콘실 · join=최종 합류.
//   roleIds = 이 단계가 쓰는 에이전트(병렬 포함). 각 역할 로직은 agents/{role}/step.ts에 격리.
//   event   = 이 단계를 트리거하는 Inngest 이벤트.
//   enters/produces = 단계 진입 상태 / AI 작업 완료 후 도달 상태.
//   proposal = linear 단계만 보유(제안 계약 디스크립터). 셀은 없음.

export type StageShape = "linear" | "fanout" | "join";

export interface PipelineStage {
  stage: Stage;
  shape: StageShape;
  roleIds: readonly string[];
  event: string;
  enters: RunState;
  produces: RunState;
  proposal?: StageDescriptor;
}

export const PIPELINE = {
  topic: {
    stage: "topic", shape: "linear", roleIds: ["topic_scout"], event: "run/topic.requested",
    enters: "created", produces: "topic_proposed", proposal: STAGE_DESCRIPTORS.topic,
  },
  title_thumb: {
    stage: "title_thumb", shape: "linear", roleIds: ["hook_maker"], event: "run/title.requested",
    enters: "topic_selected", produces: "titles_proposed", proposal: STAGE_DESCRIPTORS.title_thumb,
  },
  structure: {
    stage: "structure", shape: "linear", roleIds: ["structurer"], event: "run/structure.requested",
    enters: "titles_selected", produces: "structure_proposed", proposal: STAGE_DESCRIPTORS.structure,
  },
  research: {
    stage: "research", shape: "fanout",
    roleIds: ["sherlock_lead", "fact_verifier", "numbers", "analogist", "critic"], event: "run/research.requested",
    enters: "structure_selected", produces: "research_ready",
  },
  script: {
    stage: "script", shape: "join", roleIds: ["scribe"], event: "run/script.requested",
    enters: "research_approved", produces: "script_ready",
  },
} as const satisfies Record<Stage, PipelineStage>;
