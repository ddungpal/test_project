// step1 store-references 검증:
//   ① runOnboarding INSERT payload — arc에 references(경량 title/url/videoId 3필드만) 병합. transcript/videoFacts는 저장 안 함(용량).
//   ② loadOnboardingReferences — 최신 onboarding proposal payload의 references ?? [] 반환(loadOnboardingArc 미러·throw 0).
//   ③ 하위호환 — references 없는 옛 아크 payload도 로드 시 [](깨지지 않음).
//   fake supa는 onboardingWiring.test 패턴 미러(stage_proposals candidates 로드·insert만).
import { describe, it, expect, vi } from "vitest";
import { loadOnboardingReferences } from "../src/pipeline/onboarding.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { StageRuntimeDeps } from "../src/pipeline/stageRuntime.js";
import type { OnboardingArc, ArcReference } from "../src/agents/onboarder/schema.js";

const ARC: OnboardingArc = {
  coreAngle: "청년 자산 굴리기의 갈림길",
  questions: [
    { prompt: "적금 이자 계산?", choices: ["a", "b"], answerIdx: 0, difficulty: "basic", hookMode: "practical", ahaReveal: "실은 이렇다" },
  ],
};

const REFS: ArcReference[] = [
  { title: "파킹통장 TOP5", url: "https://youtube.com/watch?v=aaa", videoId: "aaa" },
  { title: "적금 이자 함정", url: "https://youtube.com/watch?v=bbb", videoId: "bbb" },
  { title: "복리의 마법", url: "https://youtube.com/watch?v=ccc", videoId: "ccc" },
];

// stage_proposals(candidates 로드·insert)만 지원하는 fake supa(onboardingWiring.test 미러).
function makeSupa(opts: { arcCandidates?: { idx: number; payload: unknown }[] | null } = {}) {
  const captured: { insertedProposal?: Record<string, unknown> } = {};
  const hasProposal = opts.arcCandidates != null;

  const supa = {
    from(table: string) {
      if (table === "stage_proposals") {
        return {
          select() {
            const chain: Record<string, unknown> = {
              eq() {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return chain;
              },
              maybeSingle: async () => {
                if (!hasProposal) return { data: null, error: null };
                return { data: { candidates: opts.arcCandidates }, error: null };
              },
            };
            return chain;
          },
          insert(row: Record<string, unknown>) {
            captured.insertedProposal = row;
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("loadOnboardingReferences — 최신 아크 payload의 references ?? []", () => {
  it("references가 있으면 그 배열을 반환", async () => {
    const { supa } = makeSupa({ arcCandidates: [{ idx: 0, payload: { ...ARC, references: REFS } }] });
    const refs = await loadOnboardingReferences(supa, "run1");
    expect(refs.length).toBe(3);
    expect(refs[0]?.videoId).toBe("aaa");
    expect(refs[2]?.title).toBe("복리의 마법");
  });

  it("proposal 없으면 [](throw 0)", async () => {
    const { supa } = makeSupa({ arcCandidates: null });
    expect(await loadOnboardingReferences(supa, "run1")).toEqual([]);
  });

  it("하위호환 — references 없는 옛 아크 payload도 [](깨지지 않음)", async () => {
    const { supa } = makeSupa({ arcCandidates: [{ idx: 0, payload: ARC }] });
    expect(await loadOnboardingReferences(supa, "run1")).toEqual([]);
  });
});

describe("runOnboarding INSERT — arc payload에 경량 references 병합(transcript/videoFacts 제외)", () => {
  function makeDeps(supa: Supa): StageRuntimeDeps {
    return { supa, config: {} as never, costGuard: {} as never, ledger: {} as never };
  }

  it("prepareOnboarder가 준 references에서 title/url/videoId만 뽑아 arc.references로 저장", async () => {
    const { supa, captured } = makeSupa({ arcCandidates: null });
    // prepareOnboarder는 transcript·videoFacts까지 담은 무거운 references를 반환.
    const prepare = vi.fn(async () => ({
      topic: "청년 자산",
      references: [
        { title: "파킹통장 TOP5", url: "https://youtube.com/watch?v=aaa", videoId: "aaa", transcript: "자막 전문 매우 김...", videoFacts: ["사실1", "사실2"] },
        { title: "적금 이자 함정", url: "https://youtube.com/watch?v=bbb", videoId: "bbb", transcript: "또 다른 자막" },
      ],
    }));
    const step = vi.fn(async () => ARC);
    vi.doMock("../src/agents/onboarder/prepare.js", () => ({ prepareOnboarder: prepare }));
    vi.doMock("../src/agents/onboarder/step.js", () => ({ onboarderStep: step }));
    vi.resetModules();
    const { runOnboarding: run } = await import("../src/pipeline/onboarding.js");

    const res = await run("run1", makeDeps(supa));
    expect(res.skipped).toBe(false);

    const cands = captured.insertedProposal?.candidates as { idx: number; payload: OnboardingArc }[];
    const savedRefs = cands[0]?.payload.references ?? [];
    expect(savedRefs.length).toBe(2);
    // 경량 3필드만 — transcript/videoFacts는 저장 안 함.
    expect(savedRefs[0]).toEqual({ title: "파킹통장 TOP5", url: "https://youtube.com/watch?v=aaa", videoId: "aaa" });
    expect(Object.keys(savedRefs[0] as object).sort()).toEqual(["title", "url", "videoId"]);
    expect((savedRefs[0] as Record<string, unknown>).transcript).toBeUndefined();
    expect((savedRefs[0] as Record<string, unknown>).videoFacts).toBeUndefined();
    // 반환 arc에도 동일하게 반영(payload 미러).
    expect(res.arc.references?.length).toBe(2);

    vi.doUnmock("../src/agents/onboarder/prepare.js");
    vi.doUnmock("../src/agents/onboarder/step.js");
    vi.resetModules();
  });

  it("references가 빈 배열이어도 arc.references=[]로 저장(throw 0·하위호환)", async () => {
    const { supa, captured } = makeSupa({ arcCandidates: null });
    const prepare = vi.fn(async () => ({ topic: "청년 자산", references: [] }));
    const step = vi.fn(async () => ARC);
    vi.doMock("../src/agents/onboarder/prepare.js", () => ({ prepareOnboarder: prepare }));
    vi.doMock("../src/agents/onboarder/step.js", () => ({ onboarderStep: step }));
    vi.resetModules();
    const { runOnboarding: run } = await import("../src/pipeline/onboarding.js");

    const res = await run("run1", makeDeps(supa));
    const cands = captured.insertedProposal?.candidates as { idx: number; payload: OnboardingArc }[];
    expect(cands[0]?.payload.references).toEqual([]);
    expect(res.arc.references).toEqual([]);

    vi.doUnmock("../src/agents/onboarder/prepare.js");
    vi.doUnmock("../src/agents/onboarder/step.js");
    vi.resetModules();
  });
});
