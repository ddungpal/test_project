// 쏙이 온보딩 온디맨드 배선 검증(step 3):
//   ① 회귀 가드 — 온보딩 배선이 구다리 진입 상태(thumbnails_selected)를 흔들지 않고, STAGES에 'onboarding'이 없다(off-chain 보장).
//   ② submitOnboarding 라운드트립 — 시드된 온보딩 proposal → answers 제출 → stage_selections.edited_payload에 extractGold 결과 저장.
//   ③ runOnboarding 멱등 — 기존 아크가 있으면 재생성(prepare/LLM) 없이 그대로 반환($0), 없으면 prepare→step→저장 체인.
//   fake supa는 stage_proposals(candidates 로드)·stage_selections(insert)만 최소 구현(editTopicPersona.test 패턴 미러).
import { describe, it, expect, vi } from "vitest";
import { PIPELINE, STAGE_DESCRIPTORS } from "../src/pipeline/stages.js";
import { STAGES } from "../src/domain/enums.js";
import { loadOnboardingArc, saveOnboardingGold, runOnboarding } from "../src/pipeline/onboarding.js";
import { extractGold } from "../src/lib/onboarding/arc.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { StageRuntimeDeps } from "../src/pipeline/stageRuntime.js";
import type { OnboardingArc } from "../src/agents/onboarder/schema.js";

// --- 픽스처: 최소 유효 아크(basic 정답 1 + deep 오답 1) ---
const ARC: OnboardingArc = {
  coreAngle: "청년 자산 굴리기의 갈림길",
  questions: [
    { prompt: "적금 이자 계산?", choices: ["a", "b"], answerIdx: 0, difficulty: "basic", hookMode: "practical", ahaReveal: "실은 이렇다" },
    { prompt: "복리 효과?", choices: ["a", "b"], answerIdx: 1, difficulty: "deep", hookMode: "reversal", ahaReveal: "복리는 반전이다" },
  ],
};

// stage_proposals(candidates 로드)·stage_selections(insert)만 지원하는 fake supa.
//   arcCandidates가 있으면 온보딩 proposal 존재(id="onbProp1"), 없으면 없음(maybeSingle → null).
function makeSupa(opts: { arcCandidates?: { idx: number; payload: unknown }[] | null } = {}) {
  const captured: { insertedSelection?: Record<string, unknown>; insertedProposal?: Record<string, unknown> } = {};
  const hasProposal = opts.arcCandidates != null;

  const supa = {
    from(table: string) {
      if (table === "stage_proposals") {
        return {
          select(cols: string) {
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
                // loadOnboardingArc: select("candidates"); latestOnboardingProposalId: select("id").
                if (cols.includes("candidates")) return { data: { candidates: opts.arcCandidates }, error: null };
                return { data: { id: "onbProp1" }, error: null };
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
      if (table === "stage_selections") {
        return {
          insert(row: Record<string, unknown>) {
            captured.insertedSelection = row;
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("온보딩 배선 회귀 가드 — 구다리 선형 전이·STAGES 불변", () => {
  it("PIPELINE.structure.enters는 여전히 thumbnails_selected(온디맨드=선형 밖·게이트 아님)", () => {
    expect(PIPELINE.structure.enters).toBe("thumbnails_selected");
    expect(PIPELINE.structure.produces).toBe("structure_proposed");
  });

  it("STAGES에 'onboarding'이 없다(off-chain 이벤트+함수일 뿐 — PIPELINE/STANDALONE 불변)", () => {
    expect((STAGES as readonly string[]).includes("onboarding")).toBe(false);
  });

  it("STAGE_DESCRIPTORS에도 onboarding 슬롯이 생기지 않았다", () => {
    expect("onboarding" in STAGE_DESCRIPTORS).toBe(false);
  });
});

describe("loadOnboardingArc / saveOnboardingGold 라운드트립", () => {
  it("loadOnboardingArc: candidates[0].payload를 아크로 반환", async () => {
    const { supa } = makeSupa({ arcCandidates: [{ idx: 0, payload: ARC }] });
    const arc = await loadOnboardingArc(supa, "run1");
    expect(arc?.coreAngle).toBe(ARC.coreAngle);
    expect(arc?.questions.length).toBe(2);
  });

  it("loadOnboardingArc: proposal 없으면 null", async () => {
    const { supa } = makeSupa({ arcCandidates: null });
    expect(await loadOnboardingArc(supa, "run1")).toBeNull();
  });

  it("saveOnboardingGold: onboarding proposal에 chosen_idx=0 + edited_payload=금맥으로 INSERT", async () => {
    const { supa, captured } = makeSupa({ arcCandidates: [{ idx: 0, payload: ARC }] });
    // deep 오답(chosen 0, 정답 1) → confusion/aha에 담김. basic은 정답.
    const gold = extractGold(ARC, [
      { questionIdx: 0, chosenIdx: 0 },
      { questionIdx: 1, chosenIdx: 0 },
    ]);
    await saveOnboardingGold(supa, "run1", gold);
    expect(captured.insertedSelection?.proposal_id).toBe("onbProp1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
    const saved = captured.insertedSelection?.edited_payload as typeof gold;
    expect(saved.coreAngle).toBe(ARC.coreAngle);
    expect(saved.confusionPoints).toContain("복리 효과?"); // deep 오답 prompt
    expect(saved.ahaPoints).toContain("복리는 반전이다"); // deep 오답 ahaReveal
  });

  it("saveOnboardingGold: 아크 proposal 없으면 throw(먼저 이해하기 실행)", async () => {
    const { supa } = makeSupa({ arcCandidates: null });
    const gold = extractGold(ARC, []);
    await expect(saveOnboardingGold(supa, "run1", gold)).rejects.toThrow();
  });
});

describe("runOnboarding — 멱등 + prepare→step→저장 체인", () => {
  // deps는 StageRuntimeDeps 형태(runOnboarding은 supa만 직접 쓰고 나머지는 onboarderStep에 통과).
  function makeDeps(supa: Supa): StageRuntimeDeps {
    return { supa, config: {} as never, costGuard: {} as never, ledger: {} as never };
  }

  it("기존 아크가 있으면 재생성 없이 그대로 반환(skipped=true·prepare/step 미호출)", async () => {
    const { supa, captured } = makeSupa({ arcCandidates: [{ idx: 0, payload: ARC }] });
    const prepare = vi.fn();
    const step = vi.fn();
    vi.doMock("../src/agents/onboarder/prepare.js", () => ({ prepareOnboarder: prepare }));
    vi.doMock("../src/agents/onboarder/step.js", () => ({ onboarderStep: step }));
    vi.resetModules();
    const { runOnboarding: run } = await import("../src/pipeline/onboarding.js");

    const res = await run("run1", makeDeps(supa));
    expect(res.skipped).toBe(true);
    expect(res.arc.coreAngle).toBe(ARC.coreAngle);
    expect(prepare).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    expect(captured.insertedProposal).toBeUndefined(); // 재생성 INSERT 없음
    vi.doUnmock("../src/agents/onboarder/prepare.js");
    vi.doUnmock("../src/agents/onboarder/step.js");
    vi.resetModules();
  });

  it("아크 없으면 prepare→step→stage_proposals insert(candidates[0].payload=아크·stage='onboarding')", async () => {
    const { supa, captured } = makeSupa({ arcCandidates: null });
    const prepare = vi.fn(async () => ({ topic: "청년 자산" }));
    const step = vi.fn(async () => ARC);
    vi.doMock("../src/agents/onboarder/prepare.js", () => ({ prepareOnboarder: prepare }));
    vi.doMock("../src/agents/onboarder/step.js", () => ({ onboarderStep: step }));
    vi.resetModules();
    const { runOnboarding: run } = await import("../src/pipeline/onboarding.js");

    const res = await run("run1", makeDeps(supa));
    expect(res.skipped).toBe(false);
    expect(prepare).toHaveBeenCalledOnce();
    expect(step).toHaveBeenCalledOnce();
    expect(captured.insertedProposal?.stage).toBe("onboarding");
    expect(captured.insertedProposal?.run_id).toBe("run1");
    const cands = captured.insertedProposal?.candidates as { idx: number; payload: unknown }[];
    expect(cands[0]?.idx).toBe(0);
    expect((cands[0]?.payload as OnboardingArc).coreAngle).toBe(ARC.coreAngle);
    vi.doUnmock("../src/agents/onboarder/prepare.js");
    vi.doUnmock("../src/agents/onboarder/step.js");
    vi.resetModules();
  });
});
