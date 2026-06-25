// copy-local-gen step3: 후보 출처 배지 판정(순수). DB·UI 없이 evidence_ids → local/llm 만 검증.
//   step2 localCandidates가 로컬 후보에 evidence_ids=[style.id,"skeleton"]를 박는다 → "skeleton" 유무가 판단 근거.
import { describe, it, expect } from "vitest";
import { candidateSource, CANDIDATE_SOURCE_LABEL } from "../src/lib/dashboard/proposalTypes.js";

describe("candidateSource(순수) — evidence_ids로 로컬/LLM 출처 판정", () => {
  it('evidence_ids에 "skeleton"이 있으면 local', () => {
    expect(candidateSource(["style:abc", "skeleton"])).toBe("local");
  });

  it('"skeleton"이 다른 항목들 중 어디에 있어도 local', () => {
    expect(candidateSource(["skeleton"])).toBe("local");
    expect(candidateSource(["skeleton", "style:1"])).toBe("local");
  });

  it('"skeleton"이 없으면 llm(검색 출처만 있어도)', () => {
    expect(candidateSource(["web:0", "yt:1"])).toBe("llm");
  });

  it("빈 배열은 llm(LLM 자동 폴백 포함 — skeleton 없으니 자연히 llm)", () => {
    expect(candidateSource([])).toBe("llm");
  });

  it("null/undefined도 안전하게 llm(방어)", () => {
    expect(candidateSource(null)).toBe("llm");
    expect(candidateSource(undefined)).toBe("llm");
  });

  it("부분일치로 오판하지 않는다(정확히 'skeleton'만)", () => {
    expect(candidateSource(["skeletons", "my-skeleton-x"])).toBe("llm");
  });

  it("라벨은 출처별로 정의돼 있다", () => {
    expect(CANDIDATE_SOURCE_LABEL.local).toContain("로컬");
    expect(CANDIDATE_SOURCE_LABEL.llm).toContain("LLM");
  });
});
