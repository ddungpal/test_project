// target-first-mode step1 — "타겟 먼저" 모드 작동을 못박는다.
//   ① appendPersonaDirective: targetPersona 있으면 지시문 append(값 인용 포함) / 없으면 바이트 동일.
//   ② toCandidates: targetPersona 있으면 모든 후보 payload.target_persona를 고정값으로 덮어씀
//      (title/audience_level/audience_need는 촉이 출력 그대로 보존) / 없으면 촉이 출력 그대로.

import { describe, it, expect } from "vitest";
import { TOPIC_SCOUT_SYSTEM, appendPersonaDirective, type TopicScoutOutput } from "../src/agents/topic_scout/schema.js";
import { topicStageSpec } from "../src/agents/topic_scout/stage.js";

const PERSONA = "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람";

const sampleOut: TopicScoutOutput = {
  candidates: [
    {
      title: "첫 월급 목돈 굴리기",
      reason: "댓글·경쟁영상 신호",
      evidence_ids: ["kw:목돈"],
      audience_level: "novice",
      audience_need: "어디에 넣을지 모름",
      target_persona: "LLM이 후보별로 생성한 다른 페르소나 A",
    },
    {
      title: "비상금 통장 세팅",
      reason: "질문 댓글 다수",
      evidence_ids: ["kw:비상금"],
      audience_level: "beginner",
      audience_need: "비상금이 뭔지부터 궁금",
      target_persona: "LLM이 후보별로 생성한 다른 페르소나 B",
    },
  ],
};

describe("appendPersonaDirective — 고정 타겟 지시문", () => {
  it("targetPersona가 있으면 지시문을 append하고 그 값을 인용한다", () => {
    const out = appendPersonaDirective(TOPIC_SCOUT_SYSTEM, PERSONA);
    // 원 system을 접두로 보존한다.
    expect(out.startsWith(TOPIC_SCOUT_SYSTEM)).toBe(true);
    // 지시문이 실제로 붙었다(길이 증가).
    expect(out.length).toBeGreaterThan(TOPIC_SCOUT_SYSTEM.length);
    // 넘긴 persona 값을 인용해 명시한다.
    expect(out).toContain(PERSONA);
    // '고정' 취지가 담긴다.
    expect(out).toContain("고정");
  });

  it("targetPersona가 없으면(undefined) 입력 system과 바이트 동일하다", () => {
    expect(appendPersonaDirective(TOPIC_SCOUT_SYSTEM)).toBe(TOPIC_SCOUT_SYSTEM);
  });

  it("targetPersona가 빈 문자열이면 입력 system과 바이트 동일하다", () => {
    expect(appendPersonaDirective(TOPIC_SCOUT_SYSTEM, "")).toBe(TOPIC_SCOUT_SYSTEM);
  });
});

describe("toCandidates — 고정 persona 덮어쓰기", () => {
  it("targetPersona가 있으면 모든 후보 payload.target_persona를 고정값으로 덮어쓴다", () => {
    const spec = topicStageSpec("run-target-first", { targetPersona: PERSONA });
    const cands = spec.toCandidates(sampleOut);
    expect(cands.length).toBe(2);
    for (const c of cands) {
      const payload = c.payload as Record<string, unknown>;
      expect(payload.target_persona).toBe(PERSONA);
    }
  });

  it("persona를 덮어써도 title/audience_level/audience_need는 촉이 출력 그대로 보존한다", () => {
    const spec = topicStageSpec("run-target-first", { targetPersona: PERSONA });
    const cands = spec.toCandidates(sampleOut);
    const p0 = cands[0]!.payload as Record<string, unknown>;
    expect(p0.title).toBe("첫 월급 목돈 굴리기");
    expect(p0.audience_level).toBe("novice");
    expect(p0.audience_need).toBe("어디에 넣을지 모름");
    const p1 = cands[1]!.payload as Record<string, unknown>;
    expect(p1.title).toBe("비상금 통장 세팅");
    expect(p1.audience_level).toBe("beginner");
    expect(p1.audience_need).toBe("비상금이 뭔지부터 궁금");
  });

  it("targetPersona가 없으면 촉이 출력 target_persona를 그대로 둔다", () => {
    const spec = topicStageSpec("run-plain");
    const cands = spec.toCandidates(sampleOut);
    const p0 = cands[0]!.payload as Record<string, unknown>;
    expect(p0.target_persona).toBe("LLM이 후보별로 생성한 다른 페르소나 A");
    const p1 = cands[1]!.payload as Record<string, unknown>;
    expect(p1.target_persona).toBe("LLM이 후보별로 생성한 다른 페르소나 B");
  });
});
