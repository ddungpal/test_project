// regenerate-force-path 순수 판정 — decideStageEntry가 기존 if 분기(멱등·진입가드·정상)와
//   정확히 동치인지, force=true일 때만 in-place로 갈리는지 박는다. DB·LLM 없이 순수 검증.
import { describe, it, expect } from "vitest";
import { decideStageEntry } from "../src/pipeline/regenerateDecision.js";
import { STAGE_DESCRIPTORS } from "../src/pipeline/stages.js";

describe("decideStageEntry(순수 판정)", () => {
  const fromState = "topic_selected";
  const proposedState = "titles_proposed";

  it("proposedState + force=false → memoized(기존 멱등 분기 동치)", () => {
    expect(decideStageEntry({ state: proposedState, fromState, proposedState, force: false })).toBe("memoized");
  });
  it("proposedState + force=true → run-in-place(멱등 우회 재생성)", () => {
    expect(decideStageEntry({ state: proposedState, fromState, proposedState, force: true })).toBe("run-in-place");
  });
  it("fromState → run-forward(force 여부 무관, 기존 정상 경로 동치)", () => {
    expect(decideStageEntry({ state: fromState, fromState, proposedState, force: false })).toBe("run-forward");
    expect(decideStageEntry({ state: fromState, fromState, proposedState, force: true })).toBe("run-forward");
  });
  it("그 외 무관 state → reject(기존 진입가드 에러 동치)", () => {
    expect(decideStageEntry({ state: "created", fromState, proposedState, force: false })).toBe("reject");
    expect(decideStageEntry({ state: "structure_proposed", fromState, proposedState, force: true })).toBe("reject");
  });
});

describe("decideStageEntry × descriptor(title_thumb 매핑)", () => {
  const d = STAGE_DESCRIPTORS.title_thumb; // fromState=topic_selected, proposedState=titles_proposed
  const call = (state: string, force: boolean) =>
    decideStageEntry({ state, fromState: d.fromState, proposedState: d.proposedState, force });

  it("topic_selected(=fromState)에서 → run-forward", () => {
    expect(call(d.fromState, false)).toBe("run-forward");
  });
  it("titles_proposed(=proposedState)에서 force=false → memoized, force=true → run-in-place", () => {
    expect(call(d.proposedState, false)).toBe("memoized");
    expect(call(d.proposedState, true)).toBe("run-in-place");
  });
});
