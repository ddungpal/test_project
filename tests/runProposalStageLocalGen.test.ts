// copy-local-gen: runProposalStage 로컬 단락 — localCandidates가 후보를 반환하면 callLLM을 절대 호출하지
//   않고($0·픽스처 무영향), 로컬 불가(null)면 기존 LLM 경로로 폴백하는지 callLLM 스파이로 증명한다.
//   ★ 'callLLM 미호출'이 이 step의 핵심 가치 — 스파이로 직접 못박는다.
import { describe, it, expect, vi, beforeEach } from "vitest";

// callLLM 스파이(모듈 모킹). 기본은 정상 응답을 돌려주되 호출 여부를 추적한다.
const callLLMSpy = vi.fn(async () => ({
  data: { ok: true },
  promptHash: "hash-llm",
  provider: "claude-p",
  costUsd: 0.5,
  latencyMs: 1234,
}));
vi.mock("../src/llm/callLLM.js", () => ({ callLLM: (...args: unknown[]) => callLLMSpy(...(args as [])) }));

import { runProposalStage, type ProposalStageSpec, type Candidate } from "../src/pipeline/stageContract.js";
import { STAGE_DESCRIPTORS } from "../src/pipeline/stages.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { CostGuard } from "../src/llm/costGuard.js";
import type { Supa } from "../src/pipeline/runState.js";

function cfg(mode: "hybrid" | "llm" | "local"): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: mode, softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: [], claimsPerSection: 1.5, conceptsPerSection: 1, floor: 2, ceiling: 8 },
    search: { defaultTtlSeconds: 86_400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

// production_runs(getRun·transition)·stage_proposals(insert) 만 처리하는 fake Supa.
//   run-forward 경로: state=fromState(topic_selected) → transitionRun이 update→select 체인.
function makeFakeSupa(): Supa {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.order = self;
    chain.limit = self;
    chain.update = self;
    chain.insert = self;
    chain.single = async () => {
      if (table === "production_runs") return { data: { id: "run-1", state: "topic_selected", cost_usd: 0 }, error: null };
      if (table === "stage_proposals") return { data: { id: "prop-1" }, error: null };
      return { data: null, error: null };
    };
    // transitionRun: update().eq().eq().select() → 비단일(배열). production_runs select는 [{id}] 반환.
    chain.then = undefined;
    // .select("id") after update returns a thenable-ish; emulate via maybeSingle absent — use array via .select chain end.
    return chain;
  };
  // transitionRun은 .select("id")의 결과(data 배열)를 await한다 → select가 Promise를 반환해야 한다.
  //   위 chain.select=self(체인)라 production_runs 전이엔 별도 처리가 필요. 아래서 select를 분기.
  const wrapped = (table: string) => {
    const chain = from(table) as Record<string, unknown>;
    let afterUpdate = false;
    chain.update = () => { afterUpdate = true; return chain; };
    chain.select = (..._a: unknown[]) => {
      if (table === "production_runs" && afterUpdate) {
        // transitionRun의 update→select: data 배열 1개(전이 성공).
        return Promise.resolve({ data: [{ id: "run-1" }], error: null });
      }
      return chain; // getRun·insert의 select는 체인 유지(.single로 종료).
    };
    return chain;
  };
  return { from: wrapped } as unknown as Supa;
}

const costGuard = {} as unknown as CostGuard;

/** prepare는 trivial, toCandidates도 trivial. localCandidates만 인자로 주입해 경로를 가른다. */
function makeSpec(localCandidates: ProposalStageSpec<{ ok: boolean }>["localCandidates"]): ProposalStageSpec<{ ok: boolean }> {
  return {
    runId: "run-1",
    descriptor: STAGE_DESCRIPTORS.title_thumb,
    prepare: async () => ({ system: "S", input: { topic: "예금" }, schema: { type: "object" } as never }),
    toCandidates: (): Candidate[] => [{ idx: 0, payload: { title: "LLM 후보" }, reason: "r", evidence_ids: ["e"] }],
    ...(localCandidates ? { localCandidates } : {}),
  };
}

describe("runProposalStage 로컬 단락 — callLLM 미호출 증명", () => {
  beforeEach(() => callLLMSpy.mockClear());

  it("hybrid + localCandidates가 후보 반환 → callLLM 미호출($0·provider=local)", async () => {
    const localCands: Candidate[] = [{ idx: 0, payload: { title: "로컬 후보" }, reason: "로컬", evidence_ids: ["style:x", "skeleton"] }];
    const spec = makeSpec(async () => localCands);
    const res = await runProposalStage(spec, { supa: makeFakeSupa(), config: cfg("hybrid"), costGuard });

    expect(callLLMSpy).not.toHaveBeenCalled(); // ★ 핵심
    expect(res.provider).toBe("local");
    expect(res.costUsd).toBe(0);
    expect(res.candidates).toEqual(localCands);
  });

  it("hybrid + localCandidates가 null 반환(로컬 불가) → callLLM 폴백(기존 경로)", async () => {
    const spec = makeSpec(async () => null);
    const res = await runProposalStage(spec, { supa: makeFakeSupa(), config: cfg("hybrid"), costGuard });

    expect(callLLMSpy).toHaveBeenCalledTimes(1); // 폴백
    expect(res.provider).toBe("claude-p");
    expect(res.costUsd).toBe(0.5);
  });

  it("mode=llm → localCandidates 훅이 있어도 호출 안 하고 callLLM(하위호환·바이트 동일 경로)", async () => {
    const localHook = vi.fn(async () => [{ idx: 0, payload: {}, reason: "r", evidence_ids: ["e"] }] as Candidate[]);
    const spec = makeSpec(localHook);
    const res = await runProposalStage(spec, { supa: makeFakeSupa(), config: cfg("llm"), costGuard });

    expect(localHook).not.toHaveBeenCalled(); // mode=llm이면 로컬 훅 자체를 호출 안 함
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
    expect(res.provider).toBe("claude-p");
  });

  it("forceLlm=true → localCandidates 훅 호출 안 하고 callLLM(‘새로 써줘’ 계약)", async () => {
    const localHook = vi.fn(async () => [{ idx: 0, payload: {}, reason: "r", evidence_ids: ["e"] }] as Candidate[]);
    const spec = makeSpec(localHook);
    const res = await runProposalStage(spec, { supa: makeFakeSupa(), config: cfg("hybrid"), costGuard }, { forceLlm: true });

    expect(localHook).not.toHaveBeenCalled();
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
    expect(res.provider).toBe("claude-p");
  });

  it("localCandidates 미정의 단계(topic 등) → 항상 callLLM(기존 동작 불변)", async () => {
    const spec = makeSpec(undefined);
    await runProposalStage(spec, { supa: makeFakeSupa(), config: cfg("hybrid"), costGuard });
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
  });
});
