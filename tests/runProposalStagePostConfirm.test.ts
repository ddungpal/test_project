// post-confirm 재생성: runProposalStage의 postConfirm 모드 — 확정(selectedState)에서도 진입하고,
//   새 proposal만 INSERT하며, run 상태는 전혀 안 건드린다(transitionRun·proposedState 낙관잠금 미호출,
//   production_runs는 id로만 update). 회귀 가드: postConfirm 없으면 force=run-in-place 낙관잠금,
//   fromState=transitionRun(기존 동작 바이트 동일).
import { describe, it, expect, vi, beforeEach } from "vitest";

// callLLM 스파이(모듈 모킹) — postConfirm은 변주(buildRegenerateAugmentedSystem)로 LLM 경로를 타므로
//   spy의 system 인자로 '다시 생성' 변주가 들어갔는지도 확인할 수 있다.
const callLLMSpy = vi.fn(async (_args: { system?: string }) => ({
  data: { ok: true },
  promptHash: "hash-regen",
  provider: "claude-p",
  costUsd: 0.5,
  latencyMs: 1234,
}));
vi.mock("../src/llm/callLLM.js", () => ({ callLLM: (...args: unknown[]) => callLLMSpy(...(args as [{ system?: string }])) }));

import { runProposalStage, type ProposalStageSpec, type Candidate } from "../src/pipeline/stageContract.js";
import { STAGE_DESCRIPTORS } from "../src/pipeline/stages.js";
import type { LlmConfig } from "../src/llm/config.js";
import type { CostGuard } from "../src/llm/costGuard.js";
import type { Supa } from "../src/pipeline/runState.js";

function cfg(): LlmConfig {
  return {
    backend: "claude-p", fixtures: "off", copyGenMode: "llm", softCapUsd: 7, hardCapUsd: 10, maxRework: 2,
    research: { maxClaims: 4, maxConcepts: 4, koreanOfficialDomains: [] },
    search: { defaultTtlSeconds: 86_400, volatilityTtlSeconds: { static: 1, slow: 1, fast: 1 } },
    ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  };
}

interface Captured {
  // production_runs UPDATE 형태: "id-only"(postConfirm) | "optimistic"(run-in-place, state 조건 동반) | "transition"(state 변경).
  runUpdate?: { kind: "id-only" | "optimistic" | "transition"; stateCond?: string; newState?: string };
  insertedProposal?: Record<string, unknown>;
  priorsRead: boolean; // run-in-place·postConfirm일 때만 기존 제안 목록을 읽는다(offset/priorCandidates).
}

/**
 * production_runs(getRun·update)·stage_proposals(priors select / insert) 만 처리하는 fake.
 *   state=초기 run 상태. priors=기존 제안 개수(offset 검증용·priorCandidates 1개).
 *   production_runs update의 .eq 체인 길이로 분기 종류를 캡처:
 *     - .eq("id").select() 직후 await  → id-only(postConfirm)
 *     - .eq("id").eq("state",cond).select() → optimistic(run-in-place) | transition(state 패치)
 */
function makeFakeSupa(state: string, priors: number): { supa: Supa; captured: Captured } {
  const captured: Captured = { priorsRead: false };
  const priorCands: Candidate[] = [{ idx: 0, payload: { title: "이전 안" }, reason: "r", evidence_ids: ["e"] }];

  const wrapped = (table: string) => {
    if (table === "production_runs") {
      // getRun: select("id, state, cost_usd").eq("id").single()
      // update(patch): .eq("id")[.eq("state")].select() → 캡처
      const node: Record<string, unknown> = {};
      node.select = (..._a: unknown[]) => ({
        eq: (_c: string, _v: string) => ({ single: async () => ({ data: { id: "run-1", state, cost_usd: 0 }, error: null }) }),
      });
      node.update = (patch: { state?: string; progress_note?: string | null }) => {
        // setProgress(.update({progress_note}).eq("id"))는 단계 끝마다 호출되며 .eq("id")로 끝나 thenable이 된다 →
        //   비용 patch 캡처를 오염시키므로 progress_note patch는 무시(no-op thenable).
        if ("progress_note" in patch) {
          return { eq: () => ({ then: (r: (v: { error: null }) => void) => r({ error: null }) }) };
        }
        const hasState = patch.state !== undefined; // transition은 state를 patch에 담는다(다른 둘은 비상태 patch)
        //   postConfirm: .update(patch).eq("id", runId) 까지만 await → eq 한 번 + 그 반환을 await(thenable).
        //   run-in-place: .update(patch).eq("id").eq("state",cond).select("id") await → eq 두 번 후 select await.
        //   transition: .update({state,...}).eq("id").eq("state",from).select("id") await → eq 두 번 후 select await.
        // ★ '.eq("id") 직후 await(postConfirm)' vs '.eq("id").eq(...)(나머지)'를 PromiseLike로만 가른다:
        //   await는 then을 보지만, 다음 .eq()가 먼저 호출되면 then은 호출되지 않는다.
        const afterId: Record<string, unknown> = {
          eq: (_c2: string, cond: string) => ({
            select: async () => {
              captured.runUpdate = hasState
                ? { kind: "transition", stateCond: cond, newState: patch.state! }
                : { kind: "optimistic", stateCond: cond };
              return cond === state ? { data: [{ id: "run-1" }], error: null } : { data: [], error: null };
            },
          }),
          then: (resolve: (v: { error: null }) => void) => {
            // postConfirm 경로(.eq("id") 직후 await)에서만 도달. 나머지는 .eq("state")가 먼저 소비.
            captured.runUpdate = { kind: "id-only" };
            resolve({ error: null });
          },
        };
        return { eq: (_c: string, _v: string) => afterId };
      };
      return node;
    }
    if (table === "stage_proposals") {
      // priors 읽기(run-in-place·postConfirm): select("candidates, created_at").eq.eq.order → 배열
      // insert: .insert(row).select("id").single()
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.eq = self;
      chain.order = async () => {
        captured.priorsRead = true;
        const rows = Array.from({ length: priors }, () => ({ candidates: priorCands, created_at: "t" }));
        return { data: rows, error: null };
      };
      chain.select = (..._a: unknown[]) => chain;
      chain.single = async () => ({ data: { id: "prop-new" }, error: null });
      chain.insert = (row: Record<string, unknown>) => {
        captured.insertedProposal = row;
        return { select: () => ({ single: async () => ({ data: { id: "prop-new" }, error: null }) }) };
      };
      // sources update(best-effort)는 prep.sources 없으면 안 탐.
      chain.update = () => ({ eq: async () => ({ error: null }) });
      return chain;
    }
    throw new Error(`unexpected table: ${table}`);
  };
  return { supa: { from: wrapped } as unknown as Supa, captured };
}

const costGuard = {} as unknown as CostGuard;

function makeSpec(): ProposalStageSpec<{ ok: boolean }> {
  return {
    runId: "run-1",
    descriptor: STAGE_DESCRIPTORS.title_thumb, // from=topic_selected, proposed=titles_proposed, selected=titles_selected
    prepare: async () => ({ system: "BASE", input: { topic: "예금" }, schema: { type: "object" } as never }),
    toCandidates: (): Candidate[] => [{ idx: 0, payload: { title: "새 후보" }, reason: "r", evidence_ids: ["e"] }],
  };
}

describe("runProposalStage postConfirm — 확정 후 재생성(상태 전이 없음)", () => {
  beforeEach(() => callLLMSpy.mockClear());

  it("titles_selected에서 postConfirm 재생성 → 새 proposal INSERT, run.state 불변(id로만 update)", async () => {
    const { supa, captured } = makeFakeSupa("titles_selected", 1);
    const res = await runProposalStage(makeSpec(), { supa, config: cfg(), costGuard }, { postConfirm: true });

    // 새 proposal INSERT됨
    expect(captured.insertedProposal?.run_id).toBe("run-1");
    expect(captured.insertedProposal?.stage).toBe("title_thumb");
    expect(res.proposalId).toBe("prop-new");

    // ★ run 갱신은 id로만 — 전이도 낙관잠금도 없음
    expect(captured.runUpdate?.kind).toBe("id-only");
    expect(captured.runUpdate?.stateCond).toBeUndefined();

    // 변주 경로(priors 읽음 + system에 '다시 생성' 변주 주입)
    expect(captured.priorsRead).toBe(true);
    expect(callLLMSpy).toHaveBeenCalledTimes(1);
    const sentSystem = callLLMSpy.mock.calls[0]![0].system ?? "";
    expect(sentSystem).toContain("다시 생성");
    expect(sentSystem).toContain("이전 안"); // priorCandidates 요약 주입
  });

  it("postConfirm + reason → 변주 system에 사용자 이유 반영", async () => {
    const { supa } = makeFakeSupa("titles_selected", 2);
    await runProposalStage(makeSpec(), { supa, config: cfg(), costGuard }, { postConfirm: true, reason: "더 자극적으로" });
    const sentSystem = callLLMSpy.mock.calls[0]![0].system ?? "";
    expect(sentSystem).toContain("더 자극적으로");
  });
});

describe("회귀 가드 — postConfirm 없으면 기존 분기 동일", () => {
  beforeEach(() => callLLMSpy.mockClear());

  it("proposedState(titles_proposed) + force → run-in-place 낙관잠금(state 조건 동반)", async () => {
    const { supa, captured } = makeFakeSupa("titles_proposed", 1);
    await runProposalStage(makeSpec(), { supa, config: cfg(), costGuard }, { force: true });

    // run-in-place: .eq("state", proposedState) 낙관잠금
    expect(captured.runUpdate?.kind).toBe("optimistic");
    expect(captured.runUpdate?.stateCond).toBe("titles_proposed");
    expect(captured.priorsRead).toBe(true); // 재생성이라 priors 읽음
  });

  it("fromState(topic_selected) → run-forward transitionRun(상태 전이, priors 안 읽음)", async () => {
    const { supa, captured } = makeFakeSupa("topic_selected", 0);
    await runProposalStage(makeSpec(), { supa, config: cfg(), costGuard });

    // transition: patch에 state 담겨 .eq("state", fromState)로 전이
    expect(captured.runUpdate?.kind).toBe("transition");
    expect(captured.runUpdate?.stateCond).toBe("topic_selected");
    expect(captured.runUpdate?.newState).toBe("titles_proposed");
    expect(captured.priorsRead).toBe(false); // forward는 prep 미변형(promptHash 보존)
    // forward는 변주 미주입 → 기존 base system 그대로
    const sentSystem = callLLMSpy.mock.calls[0]![0].system ?? "";
    expect(sentSystem).toBe("BASE");
  });
});
