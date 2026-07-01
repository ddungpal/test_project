// isStructureDownstreamStarted 경계 테스트 — §F staleness 경고 판정(순수 함수, DOM 무관).
//   핵심: structure_selected 자신은 false(아직 다운스트림 시작 전), 그 이후 상태는 전부 true.
//   구성 편집 UI는 이 판정만 경고 배너에 쓴다(차단 없음) — 컴포넌트/드래그 시뮬은 범위 밖.
import { describe, it, expect } from "vitest";
import { isStructureDownstreamStarted } from "../src/lib/outline/staleness.js";
import { RUN_STATES, type RunState } from "../src/domain/enums.js";

describe("isStructureDownstreamStarted", () => {
  it("structure_selected 자신은 false (아직 리서치·스크립트 시작 전)", () => {
    expect(isStructureDownstreamStarted("structure_selected")).toBe(false);
  });

  it("structure_selected 이전 상태들은 false", () => {
    const before: RunState[] = [
      "created",
      "topic_proposed",
      "topic_selected",
      "titles_proposed",
      "titles_selected",
      "thumbnails_proposed",
      "thumbnails_selected",
      "structure_proposed",
    ];
    for (const s of before) expect(isStructureDownstreamStarted(s)).toBe(false);
  });

  it("structure_selected 이후(다운스트림) 상태들은 true", () => {
    const after: RunState[] = [
      "research_scoped",
      "researching",
      "research_ready",
      "research_review",
      "research_approved",
      "scripting",
      "script_ready",
      "script_review",
      "approved",
      "published",
    ];
    for (const s of after) expect(isStructureDownstreamStarted(s)).toBe(true);
  });

  it("대표 경계값 스팟 체크", () => {
    expect(isStructureDownstreamStarted("research_scoped")).toBe(true);
    expect(isStructureDownstreamStarted("script_review")).toBe(true);
    expect(isStructureDownstreamStarted("published")).toBe(true);
  });

  it("비용/중단 상태(paused_soft_cap·aborted)는 다운스트림 집합 밖 → false", () => {
    expect(isStructureDownstreamStarted("paused_soft_cap")).toBe(false);
    expect(isStructureDownstreamStarted("aborted")).toBe(false);
  });

  it("모든 RunState에 대해 예외 없이 boolean을 반환한다(누락 상태 방어)", () => {
    for (const s of RUN_STATES) expect(typeof isStructureDownstreamStarted(s)).toBe("boolean");
  });
});
