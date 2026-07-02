// 쏙이 온보딩 — 난이도 타겟 추가 생성(step1: onboarder-difficulty-more).
//   ① appendOnboardingQuestions: 기존 arc.questions에 append(기존 보존·길이 증가·중복 아님) + proposal UPDATE.
//   ② prepareOnboarderFromRefs(및 append 경로)가 gatherExternalSignals(검색)를 절대 호출하지 않는다(spy 0회).
//   ③ more 없으면 기존 onboarderStep이 쓰는 system이 ONBOARDER_SYSTEM 그대로(추가지시 없음·바이트 동일).
//   ④ 확장 아크로 extractGold가 추가 오답을 confusions/aha에 반영(순수함수).
//
// ★ gatherExternalSignals는 append 경로에서 호출 안 되니 단순 spy로 "0회"만 검증(rejected 아님).
//   fetchTranscript는 catch로 삼키므로 vi.fn 대신 교체 가능한 impl + 카운터로 스텁(onboardingTranscript.test 선례).
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TranscriptResponse } from "youtube-transcript";

// youtube-transcript.fetchTranscript 스텁 — 교체 가능한 impl + 호출 카운터(rejected 삼킴 검증 우회).
const yt = vi.hoisted(() => ({
  calls: 0,
  impl: async (_id: string, _cfg?: unknown): Promise<TranscriptResponse[]> => [],
}));
vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: {
    fetchTranscript: (id: string, cfg?: unknown) => {
      yt.calls++;
      return yt.impl(id, cfg);
    },
  },
}));

// gatherExternalSignals 스텁 — 호출되면 카운터++(append 경로에선 0이어야 함). 나머지 export는 원본 유지.
const gx = vi.hoisted(() => ({
  calls: 0,
  impl: async (_opts: unknown): Promise<unknown[]> => [],
}));
vi.mock("../src/agents/topic_scout/externalSignals.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/agents/topic_scout/externalSignals.js")>();
  return {
    ...orig,
    gatherExternalSignals: (opts: unknown) => {
      gx.calls++;
      return gx.impl(opts);
    },
  };
});

// callLLM 스텁 — 넘어온 req.system/req.input을 캡처하고 지정 data를 반환(실호출·비용가드 우회).
const llm = vi.hoisted(() => ({
  lastSystem: undefined as string | undefined,
  data: undefined as unknown,
}));
vi.mock("../src/llm/callLLM.js", () => ({
  callLLM: async (req: { system: string }) => {
    llm.lastSystem = req.system;
    return { data: llm.data, usage: { inTok: 1, outTok: 1 }, costUsd: 0, latencyMs: 0, provider: "test", promptHash: "h" };
  },
}));

// getSelectedStagePayload를 topic title로 스텁(candidates 분기 복잡성 회피). context 모듈만 부분 mock.
vi.mock("../src/pipeline/context.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/pipeline/context.js")>();
  return {
    ...orig,
    getSelectedStagePayload: async (_supa: unknown, _runId: string, stage: string) => {
      if (stage === "topic") return { title: "청년 자산 굴리기" };
      return null;
    },
  };
});

import { prepareOnboarderFromRefs } from "../src/agents/onboarder/prepare.js";
import { onboarderMoreStep, onboarderStep } from "../src/agents/onboarder/step.js";
import { appendOnboardingQuestions } from "../src/pipeline/onboarding.js";
import { extractGold } from "../src/lib/onboarding/arc.js";
import { ONBOARDER_SYSTEM } from "../src/agents/onboarder/schema.js";
import type { OnboardingArc, ArcQuestion, ArcReference } from "../src/agents/onboarder/schema.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { StageRuntimeDeps } from "../src/pipeline/stageRuntime.js";
import type { CallLLMDeps } from "../src/llm/callLLM.js";

// --- 픽스처: 최소 유효 아크(basic 정답 1 + deep 오답 1) + 저장된 refs 1개 ---
const REFS: ArcReference[] = [
  { title: "레퍼 영상", url: "https://www.youtube.com/watch?v=ABC123", videoId: "ABC123" },
];
const ARC: OnboardingArc = {
  coreAngle: "청년 자산 굴리기의 갈림길",
  questions: [
    { prompt: "적금 이자 계산?", choices: ["a", "b"], answerIdx: 0, difficulty: "basic", hookMode: "practical", ahaReveal: "실은 이렇다" },
    { prompt: "복리 효과?", choices: ["a", "b"], answerIdx: 1, difficulty: "deep", hookMode: "reversal", ahaReveal: "복리는 반전이다" },
  ],
  references: REFS,
};

// 새로 생성될 deep 문항(중복 아님).
const NEW_DEEP: ArcQuestion[] = [
  { prompt: "인플레이션과 실질금리?", choices: ["a", "b"], answerIdx: 1, difficulty: "deep", hookMode: "reversal", ahaReveal: "실질금리는 이렇게 깎인다" },
  { prompt: "세후 수익률 착시?", choices: ["a", "b"], answerIdx: 0, difficulty: "deep", hookMode: "reversal", ahaReveal: "세금 떼면 이만큼 줄어든다" },
];

// stage_proposals(candidates 로드·id 로드·update)만 지원하는 fake supa.
//   loadOnboardingArc: select("candidates") → arcCandidates.
//   latestOnboardingProposalId: select("id") → { id: "onbProp1" }.
//   update({...}).eq("id", id) → captured.updatedProposal 기록.
//   topic payload는 stage_proposals candidates에 담겨오지만, prepareOnboarderFromRefs는 getSelectedStagePayload를 쓴다.
function makeSupa(opts: { arc?: OnboardingArc | null; topicTitle?: string } = {}) {
  const captured: { updatedProposal?: Record<string, unknown>; updatedId?: unknown } = {};
  const arc = opts.arc === undefined ? ARC : opts.arc;
  const topicTitle = opts.topicTitle ?? "청년 자산 굴리기";

  const supa = {
    from(table: string) {
      if (table === "stage_proposals") {
        return {
          select(cols: string) {
            const chain: Record<string, unknown> = {
              eq(_col?: string, _val?: unknown) {
                return chain;
              },
              order() {
                return chain;
              },
              limit() {
                return chain;
              },
              maybeSingle: async () => {
                if (cols.includes("candidates")) {
                  // topic 로드(getSelectedStagePayload)와 arc 로드(loadOnboardingArc)가 모두 candidates를 읽는다.
                  // getSelectedStagePayload는 stage="topic"으로 조회 → 여기선 stage 구분 없이 topic payload를 우선 반환하면
                  // arc 로드가 깨진다. 그래서 chain에 마지막으로 eq된 stage를 기록해 분기한다(아래 eq 오버라이드).
                  return { data: { candidates: [{ idx: 0, payload: arc }] }, error: null };
                }
                return { data: { id: "onbProp1" }, error: null };
              },
            };
            return chain;
          },
          update(row: Record<string, unknown>) {
            captured.updatedProposal = row;
            return {
              eq(col: string, val: unknown) {
                captured.updatedId = val;
                void col;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "stage_selections") {
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
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  void topicTitle;
  return { supa, captured };
}

describe("prepareOnboarderFromRefs — 저장된 refs 재사용(검색 0회)", () => {
  beforeEach(() => {
    yt.calls = 0;
    yt.impl = async () => [];
    gx.calls = 0;
    gx.impl = async () => [];
  });

  it("gatherExternalSignals를 절대 호출하지 않고 저장된 refs로 input을 조립한다", async () => {
    yt.impl = async () => [{ text: "자막", duration: 1, offset: 0 }];
    const { supa } = makeSupa();
    const input = await prepareOnboarderFromRefs(supa, "run1", REFS);
    expect(gx.calls).toBe(0); // ★ 재검색 없음
    expect(input.topic).toBe("청년 자산 굴리기");
    expect(input.references.length).toBe(1);
    expect(input.references[0]!.videoId).toBe("ABC123");
    expect(input.references[0]!.transcript).toBe("자막");
  });

  it("storedRefs가 []여도 { topic, references:[] }를 반환한다(구버전 아크 하위호환·throw 0)", async () => {
    const { supa } = makeSupa();
    const input = await prepareOnboarderFromRefs(supa, "run1", []);
    expect(gx.calls).toBe(0);
    expect(input.references).toEqual([]);
    expect(input.topic).toBe("청년 자산 굴리기");
  });

  it("videoId 없는 ref는 스킵하고, 자막 fetch가 throw해도 삼킨다(best-effort)", async () => {
    yt.impl = async () => {
      throw new Error("자막 비활성");
    };
    const refs: ArcReference[] = [
      { title: "정상", url: "https://youtu.be/XYZ789", videoId: "XYZ789" },
      { title: "videoId 없음", url: "https://x", videoId: "" },
    ];
    const { supa } = makeSupa();
    const input = await prepareOnboarderFromRefs(supa, "run1", refs);
    expect(gx.calls).toBe(0);
    expect(input.references.length).toBe(1); // videoId 빈 것 스킵
    expect("transcript" in input.references[0]!).toBe(false); // 자막 throw → 키 생략
  });
});

const DEPS = { costGuard: {} as never } as CallLLMDeps;

describe("onboarderStep — more 없는 default 경로는 ONBOARDER_SYSTEM 그대로(바이트 동일)", () => {
  beforeEach(() => {
    llm.lastSystem = undefined;
    llm.data = { coreAngle: "x", questions: ARC.questions };
  });

  it("onboarderStep이 callLLM에 넘기는 system이 ONBOARDER_SYSTEM 원문과 동일하다(추가지시 없음)", async () => {
    await onboarderStep(DEPS, "run1", { topic: "t", references: [] });
    expect(llm.lastSystem).toBe(ONBOARDER_SYSTEM); // ★ 바이트 동일
  });
});

describe("onboarderMoreStep — 난이도 타겟 추가지시가 system에 붙는다", () => {
  beforeEach(() => {
    llm.lastSystem = undefined;
    llm.data = { coreAngle: "x", questions: NEW_DEEP };
  });

  it("system이 ONBOARDER_SYSTEM으로 시작하고 난이도·추가 문항 지시를 포함한다(원문 미변경)", async () => {
    const qs = await onboarderMoreStep(DEPS, "run1", { topic: "t", references: [] }, "deep", ARC);
    expect(llm.lastSystem?.startsWith(ONBOARDER_SYSTEM)).toBe(true); // 원문 보존 + 추가지시
    expect(llm.lastSystem).toContain("추가 문항 생성 모드");
    expect(llm.lastSystem).toContain("deep");
    expect(llm.lastSystem).toContain(ARC.questions[0]!.prompt); // 기존 prompt 나열(중복 방지 근거)
    expect(llm.lastSystem).toContain(ARC.coreAngle); // 기존 coreAngle 나열(연속성)
    expect(qs.length).toBe(2);
  });
});

describe("appendOnboardingQuestions — 기존 아크에 append + proposal UPDATE", () => {
  beforeEach(() => {
    gx.calls = 0;
    gx.impl = async () => [];
    yt.calls = 0;
    yt.impl = async () => [];
  });

  const append = appendOnboardingQuestions;

  function makeDeps(supa: Supa): StageRuntimeDeps {
    return { supa, config: {} as never, costGuard: {} as never, ledger: {} as never };
  }

  it("생성 문항을 기존 arc.questions에 append하고(기존 보존·길이 증가) proposal을 UPDATE한다", async () => {
    const { supa, captured } = makeSupa({ arc: ARC });
    llm.data = { coreAngle: "이어지는 갈림길", questions: NEW_DEEP }; // onboarderMoreStep이 callLLM으로 받음.

    const res = await append("run1", makeDeps(supa), "deep");

    expect(gx.calls).toBe(0); // ★ 재검색 없음
    expect(res.appended).toBe(2);
    expect(res.arc.questions.length).toBe(4); // 2 기존 + 2 신규
    // 기존 문항 보존
    expect(res.arc.questions[0]!.prompt).toBe("적금 이자 계산?");
    expect(res.arc.questions[1]!.prompt).toBe("복리 효과?");
    // 신규 문항 뒤에 붙음
    expect(res.arc.questions[2]!.prompt).toBe("인플레이션과 실질금리?");
    // 기존 coreAngle 보존(추가 생성이 coreAngle을 덮어쓰지 않음)
    expect(res.arc.coreAngle).toBe(ARC.coreAngle);
    // references 보존(재사용)
    expect(res.arc.references).toEqual(REFS);
    // proposal UPDATE(INSERT 아님)·같은 id
    expect(captured.updatedId).toBe("onbProp1");
    const cands = captured.updatedProposal?.candidates as { idx: number; payload: OnboardingArc }[];
    expect(cands[0]!.idx).toBe(0);
    expect(cands[0]!.payload.questions.length).toBe(4);
  });

  it("생성 문항 중 기존 prompt와 정확히 일치하는 건 드랍한다(LLM 불이행 방어)", async () => {
    const { supa } = makeSupa({ arc: ARC });
    // 기존 "복리 효과?" 중복 + 신규 1개 → 중복 드랍.
    llm.data = { coreAngle: "x", questions: [{ ...ARC.questions[1]!, difficulty: "deep" }, NEW_DEEP[0]!] };

    const res = await append("run1", makeDeps(supa), "deep");
    expect(res.appended).toBe(1); // 중복 1개 드랍
    expect(res.arc.questions.length).toBe(3);
    expect(res.arc.questions.map((q) => q.prompt)).toEqual([
      "적금 이자 계산?",
      "복리 효과?",
      "인플레이션과 실질금리?",
    ]);
  });

  it("아크가 없으면 throw한다(먼저 이해하기 실행)", async () => {
    const { supa } = makeSupa({ arc: null });
    await expect(append("run1", makeDeps(supa), "deep")).rejects.toThrow(/온보딩 아크가 없습니다/);
  });
});

describe("extractGold — 확장 아크의 추가 오답이 confusions/aha에 반영된다(순수함수)", () => {
  it("append된 deep 문항을 틀리면 그 prompt/ahaReveal이 금맥에 담긴다", () => {
    const extended: OnboardingArc = {
      ...ARC,
      questions: [...ARC.questions, ...NEW_DEEP],
    };
    // idx2(인플레이션) 오답, idx3(세후) 정답.
    const gold = extractGold(extended, [
      { questionIdx: 0, chosenIdx: 0 }, // basic 정답
      { questionIdx: 2, chosenIdx: 0 }, // deep 오답(정답 1)
      { questionIdx: 3, chosenIdx: 0 }, // deep 정답
    ]);
    expect(gold.confusionPoints).toContain("인플레이션과 실질금리?");
    expect(gold.ahaPoints).toContain("실질금리는 이렇게 깎인다");
    expect(gold.confusionPoints).not.toContain("세후 수익률 착시?"); // 정답이라 제외
    expect(gold.coreAngle).toBe(ARC.coreAngle);
  });
});
