// 제안 단계 진입 방식 판정(순수) — runProposalStage의 분기를 테스트 가능한 순수함수로 분리.
//   force=false면 기존 if 분기(멱등·진입가드·정상)와 정확히 동치. force=true는 proposedState에서만
//   in-place 재생성(멱등 우회). fromState·proposedState는 서로 다른 state라 겹치지 않는다.
//
//   memoized    = 이미 proposedState → 기존 제안 반환(재과금 0).
//   run-forward = fromState → 정상 경로(prepare→LLM→insert→전이).
//   run-in-place= proposedState + force → 같은 state 유지하고 새 제안만 INSERT(전이 없음).
//   reject      = 그 외 → 진입 가드 거부.

export type StageEntry = "memoized" | "run-forward" | "run-in-place" | "reject";

export function decideStageEntry(args: {
  state: string;
  fromState: string;
  proposedState: string;
  force: boolean;
}): StageEntry {
  const { state, fromState, proposedState, force } = args;
  if (state === proposedState) return force ? "run-in-place" : "memoized";
  if (state === fromState) return "run-forward";
  return "reject";
}
