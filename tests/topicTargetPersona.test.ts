// target-persona step0 — 촉이(topic_scout)가 후보마다 target_persona(누구+상황+막막함 한 줄)를
//   생성하고 toCandidates payload에 보존하는지 못박는다.
//   ① TOPIC_SCOUT_SCHEMA: candidate.required에 target_persona + properties.minLength 1.
//   ② toCandidates: 출력의 target_persona를 payload에 보존(+ 기존 title/audience_level/need 병존).
//   ③ TOPIC_SCOUT_SYSTEM: 페르소나 생성 지시·예시·need와의 차이 명시.

import { describe, it, expect } from "vitest";
import { TOPIC_SCOUT_SCHEMA, TOPIC_SCOUT_SYSTEM, type TopicScoutOutput } from "../src/agents/topic_scout/schema.js";
import { topicStageSpec } from "../src/agents/topic_scout/stage.js";

describe("TOPIC_SCOUT_SCHEMA — target_persona required 잠금", () => {
  // candidate item 스키마를 꺼낸다.
  const candidate = (TOPIC_SCOUT_SCHEMA.properties as any).candidates.items as any;

  it("candidate.required에 target_persona가 포함된다(audience_need와 동일 등급)", () => {
    expect(candidate.required).toContain("target_persona");
    // 기존 required는 그대로 병존.
    expect(candidate.required).toContain("audience_level");
    expect(candidate.required).toContain("audience_need");
  });

  it("properties.target_persona는 minLength 1의 string이다", () => {
    expect(candidate.properties.target_persona).toEqual({ type: "string", minLength: 1 });
  });
});

describe("TOPIC_SCOUT_SYSTEM — 페르소나 생성 지시", () => {
  it("target_persona를 한 줄로 쓰라는 지시와 예시 2개를 포함한다", () => {
    expect(TOPIC_SCOUT_SYSTEM).toContain("target_persona");
    expect(TOPIC_SCOUT_SYSTEM).toContain("2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람");
    expect(TOPIC_SCOUT_SYSTEM).toContain("자녀계좌 만들려는 30·40대 부모, 증여세·절차 헷갈리는 사람");
  });

  it("audience_need와의 차이(사람 정의 vs 욕구)를 명시한다", () => {
    expect(TOPIC_SCOUT_SYSTEM).toContain("audience_need");
  });
});

describe("toCandidates — target_persona payload 보존(전파 배선)", () => {
  it("출력의 target_persona를 payload에 보존하고 기존 필드도 병존한다", () => {
    const out: TopicScoutOutput = {
      candidates: [
        {
          title: "첫 월급 목돈 굴리기",
          reason: "댓글·경쟁영상 신호",
          evidence_ids: ["kw:목돈"],
          audience_level: "novice",
          audience_need: "어디에 넣을지 모름",
          target_persona: "2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람",
        },
      ],
    };

    const spec = topicStageSpec("run-persona");
    const cands = spec.toCandidates(out);
    expect(cands.length).toBe(1);
    const payload = cands[0]!.payload as Record<string, unknown>;
    // 핵심: target_persona가 payload에 실린다(없으면 다운스트림 전파 끊김).
    expect(payload.target_persona).toBe("2030 사회초년생, 첫 월급 받고 목돈 굴리는 법 막막한 사람");
    // 기존 필드 병존(제거·변경 금지).
    expect(payload.title).toBe("첫 월급 목돈 굴리기");
    expect(payload.audience_level).toBe("novice");
    expect(payload.audience_need).toBe("어디에 넣을지 모름");
  });
});
