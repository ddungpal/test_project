// 제안 단계 Inngest 실행 — 공통 런타임(withStageRuntime) 위에서 runProposalStage 한 줄.
//   deps 조립·비용가드는 stageRuntime이 담당(셀과 동일 기반). 여기선 결과 매핑만.
import { runProposalStage, type ProposalStageSpec } from "../../pipeline/stageContract.js";
import { withStageRuntime } from "../../pipeline/stageRuntime.js";

export async function executeProposalStage<TOut>(spec: ProposalStageSpec<TOut>, opts: { softAck?: boolean | undefined } = {}) {
  const guarded = await withStageRuntime(spec.runId, (deps) => runProposalStage(spec, deps), opts);
  if (guarded.status !== "ok") return { runId: spec.runId, status: guarded.status };
  const res = guarded.value;
  return { runId: res.runId, status: "ok" as const, proposalId: res.proposalId, count: res.candidates.length, state: res.state, skipped: res.skipped };
}
