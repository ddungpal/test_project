// Phase 2 모듈 단위 테스트 — 상태머신·검증가드·단계계약·검색어댑터의 핵심 로직을 실제로 검증.
// (DB·LLM 없이 도는 순수 로직만. 통합 경로는 scripts/run-topic-slice.ts.)
import { describe, it, expect } from "vitest";
import { canTransition, ALLOWED_TRANSITIONS, RUN_STATES, STAGES, isVerifiedValid, type RunState } from "../src/domain/enums.js";
import { STAGE_DESCRIPTORS } from "../src/pipeline/stages.js";
import { checkArithmetic, quoteIsReal } from "../src/pipeline/researchReconcile.js";
import { searchHash, pickSearchBackend } from "../src/search/search.js";
import { mockBackend } from "../src/search/backends/mock.js";
import { stripJosa } from "../src/agents/topic_scout/prepare.js";
import { buildCorpusShingles, containment, PLAGIARISM_THRESHOLD, PLAGIARISM_BLOCK_THRESHOLD } from "../src/pipeline/scriptGuards.js";
import { CostGuard, SoftCapPause, HardCapExceededError, InMemoryCostLedger } from "../src/llm/costGuard.js";
import { isCapError, flushLedger } from "../src/pipeline/runGuards.js";

describe("상태머신(enums)", () => {
  it("정상 전이 흐름 허용", () => {
    expect(canTransition("created", "topic_proposed")).toBe(true);
    expect(canTransition("structure_selected", "researching")).toBe(true);
    expect(canTransition("research_ready", "research_review")).toBe(true);
    expect(canTransition("research_review", "research_approved")).toBe(true);
  });
  it("불법 전이 차단(건너뛰기·역행)", () => {
    expect(canTransition("created", "published")).toBe(false);
    expect(canTransition("topic_proposed", "researching")).toBe(false);
    expect(canTransition("research_approved", "topic_selected")).toBe(false);
  });
  it("종료 상태는 더 못 나감", () => {
    expect(ALLOWED_TRANSITIONS.published).toEqual([]);
    expect(ALLOWED_TRANSITIONS.aborted).toEqual([]);
  });
  it("모든 상태에서 aborted(kill switch) 가능 — published/aborted 제외", () => {
    for (const s of RUN_STATES) {
      if (s === "published" || s === "aborted") continue;
      expect(ALLOWED_TRANSITIONS[s], `${s}→aborted`).toContain("aborted");
    }
  });
  it("rework 재진입 엣지 존재(연구·스크립트)", () => {
    expect(canTransition("research_review", "researching")).toBe(true);
    expect(canTransition("scripting", "researching")).toBe(true);
    expect(canTransition("paused_soft_cap", "researching")).toBe(true);
  });
  it("썸네일 단계 분리: 제목→썸네일→구성 경로(기존 제목→구성 직행 차단)", () => {
    expect(canTransition("titles_selected", "thumbnails_proposed")).toBe(true);
    expect(canTransition("titles_selected", "structure_proposed")).toBe(false); // 이제 막힘 — 썸네일 경유
    expect(canTransition("thumbnails_proposed", "thumbnails_selected")).toBe(true);
    expect(canTransition("thumbnails_selected", "structure_proposed")).toBe(true);
  });
  it("새 썸네일 상태가 RUN_STATES·STAGES에 등록됨", () => {
    expect(RUN_STATES).toContain("thumbnails_proposed");
    expect(RUN_STATES).toContain("thumbnails_selected");
    expect(STAGES).toContain("thumbnail");
  });
  it("ALLOWED_TRANSITIONS 키 집합이 RUN_STATES와 1:1(누락/잉여 없음)", () => {
    const keys = Object.keys(ALLOWED_TRANSITIONS).sort();
    expect(keys).toEqual([...RUN_STATES].sort());
  });
});

describe("verified 합격 가드(isVerifiedValid §5·§9)", () => {
  const base = { verificationStatus: "verified" as const, independentOriginCount: 2, citationVerified: true, isFinancial: false, sourceTier: "press" as const, quoteExcerpt: "근거 문장" };
  it("verified가 아니면 게이트 무관(통과)", () => {
    expect(isVerifiedValid({ ...base, verificationStatus: "unverified" })).toBe(true);
    expect(isVerifiedValid({ ...base, verificationStatus: "could_not_verify", quoteExcerpt: null, independentOriginCount: 0 })).toBe(true);
  });
  it("독립출처 2 미만이면 verified 불가", () => {
    expect(isVerifiedValid({ ...base, independentOriginCount: 1 })).toBe(false);
  });
  it("인용 미검증·인용문 없음이면 불가", () => {
    expect(isVerifiedValid({ ...base, citationVerified: false })).toBe(false);
    expect(isVerifiedValid({ ...base, quoteExcerpt: null })).toBe(false);
  });
  it("금융 claim은 1차 출처(primary)만 verified — press/blog/null 거부", () => {
    expect(isVerifiedValid({ ...base, isFinancial: true, sourceTier: "press" })).toBe(false);
    expect(isVerifiedValid({ ...base, isFinancial: true, sourceTier: null })).toBe(false);
    expect(isVerifiedValid({ ...base, isFinancial: true, sourceTier: "primary" })).toBe(true);
  });
  it("비금융 + 모든 조건 충족이면 verified", () => {
    expect(isVerifiedValid(base)).toBe(true);
  });
});

describe("단계 디스크립터 ↔ 상태머신 정합성(stages)", () => {
  it("모든 단계의 from→proposed, proposed→selected 전이가 합법", () => {
    for (const d of Object.values(STAGE_DESCRIPTORS)) {
      expect(canTransition(d.fromState as RunState, d.proposedState as RunState), `${d.stage}: ${d.fromState}→${d.proposedState}`).toBe(true);
      expect(canTransition(d.proposedState as RunState, d.selectedState as RunState), `${d.stage}: ${d.proposedState}→${d.selectedState}`).toBe(true);
    }
  });
  it("단계 체인이 끊김 없이 이어짐(topic→title_thumb→thumbnail→structure)", () => {
    expect(STAGE_DESCRIPTORS.topic.selectedState).toBe(STAGE_DESCRIPTORS.title_thumb.fromState);
    expect(STAGE_DESCRIPTORS.title_thumb.selectedState).toBe(STAGE_DESCRIPTORS.thumbnail.fromState);
    expect(STAGE_DESCRIPTORS.thumbnail.selectedState).toBe(STAGE_DESCRIPTORS.structure.fromState);
  });
  it("structure 단계는 썸네일 확정 후 진입(fromState=thumbnails_selected)", () => {
    expect(STAGE_DESCRIPTORS.structure.fromState).toBe("thumbnails_selected");
  });
});

describe("산술 검산(checkArithmetic §9-⑤)", () => {
  it("맞는 계산 통과", () => {
    expect(checkArithmetic("1000000 * 0.03 = 30000")).toBe(true);
    expect(checkArithmetic("5000 - 5000 = 0")).toBe(true);
    expect(checkArithmetic("1,000,000 * 0.034 = 34000")).toBe(true); // 콤마 허용
  });
  it("틀린 계산 거부", () => {
    expect(checkArithmetic("1000000 * 0.03 = 31000")).toBe(false);
  });
  it("작은 오차도 거부(금액은 정확해야 — 1% 허용 회귀 차단)", () => {
    expect(checkArithmetic("1000000 * 0.03 = 30250")).toBe(false); // 0.83% off
  });
  it("형식 불명은 null(판별 불가)", () => {
    expect(checkArithmetic("대략 3만원쯤")).toBeNull();
    expect(checkArithmetic("100 + 5")).toBeNull(); // = 없음
  });
  it("코드 주입 시도는 평가되지 않음(null)", () => {
    expect(checkArithmetic("process.exit(1) = 0")).toBeNull();
    expect(checkArithmetic("require('fs') = 1")).toBeNull();
  });
});

describe("인용 실재 + [MOCK] 우회 차단(quoteIsReal §9-② · 코드리뷰 P0)", () => {
  it("실제 결과에 있는 인용은 true", () => {
    const results = [{ title: "국세청 안내", content: "ISA 비과세 한도는 200만원이다." }];
    expect(quoteIsReal("ISA 비과세 한도는 200만원이다.", results)).toBe(true);
  });
  it("인용이 어디에도 없으면 false", () => {
    const results = [{ title: "x", content: "다른 내용" }];
    expect(quoteIsReal("없는 문장", results)).toBe(false);
  });
  it("★ [MOCK] 결과의 꼬리 문장을 인용해도 false(우회 차단)", () => {
    // mock content: 마커가 앞에만 있고 뒤에 인용 가능한 실문장이 붙는 구조 → 통째로 제외돼야 함.
    const mock = [{ title: "[MOCK] 파킹통장 (국세청)", content: '[MOCK 검색결과 — 실제 사실 아님] "파킹통장"에 대한 국세청의 설명 문단(개발용 더미).' }];
    expect(quoteIsReal('"파킹통장"에 대한 국세청의 설명 문단(개발용 더미).', mock)).toBe(false);
  });
  it("null/빈 인용은 false", () => {
    expect(quoteIsReal(null, [{ title: "a", content: "b" }])).toBe(false);
    expect(quoteIsReal("", [{ title: "a", content: "b" }])).toBe(false);
  });
});

describe("한국어 조사 분리(stripJosa · 코드리뷰 P1)", () => {
  it("어간 2자 이상 + 조사 분리", () => {
    expect(stripJosa("투자를")).toBe("투자");
    expect(stripJosa("파킹통장은")).toBe("파킹통장");
    expect(stripJosa("수익으로")).toBe("수익");
  });
  it("최장일치(긴 조사 우선) — '으로'가 '로'보다 먼저", () => {
    expect(stripJosa("적금으로")).toBe("적금"); // '으로' 통째 분리(‘적금으’ 아님)
  });
  it("1자 어간으로 줄어드는 오분리는 막는다(주가·물가·제도 보존)", () => {
    expect(stripJosa("주가")).toBe("주가");
    expect(stripJosa("물가")).toBe("물가");
    expect(stripJosa("제도")).toBe("제도");
  });
  it("조사 없는 단어는 그대로", () => {
    expect(stripJosa("나스닥")).toBe("나스닥");
  });
});

describe("표절 가드(scriptGuards.containment §12)", () => {
  const corpus = buildCorpusShingles([
    "안녕하세요 짠순이 부자되기 김짠부입니다 오늘은 파킹통장 이야기를 해볼게요",
    "ETF는 쉽게 말하면 편의점 도시락 같은 거예요 여러 종목이 한 판에 담겨있죠",
  ]);
  it("코퍼스를 그대로 베낀 문장은 포함도 높음", () => {
    const copied = "안녕하세요 짠순이 부자되기 김짠부입니다 오늘은 파킹통장 이야기를 해볼게요";
    expect(containment(copied, corpus)).toBeGreaterThan(0.9);
  });
  it("새로 쓴 문장은 포함도 낮음", () => {
    const fresh = "요즘 금리가 들쑥날쑥해서 어디다 돈을 둬야 할지 고민이 많으시죠";
    expect(containment(fresh, corpus)).toBeLessThan(0.3);
  });
  it("빈 문자열은 0", () => {
    expect(containment("", corpus)).toBe(0);
  });
});

describe("반장 비용 2단캡 per-run(CostGuard.seed §8)", () => {
  const mk = () => new CostGuard({ softCapUsd: 7, hardCapUsd: 10 });
  it("seed로 누계 주입 → SOFT 초과 시 일시정지 신호", () => {
    const g = mk();
    g.seed("run1", 6.5); // 편 누계 $6.5(이전 단계들)
    expect(() => g.reserve("run1", 1.0)).toThrow(SoftCapPause); // 6.5+1 > 7
  });
  it("seed 누계로 HARD 초과 시 중단", () => {
    const g = mk();
    g.seed("run1", 9.5);
    g.acknowledgeSoftCap("run1"); // SOFT는 승인된 상태
    expect(() => g.reserve("run1", 1.0)).toThrow(HardCapExceededError); // 9.5+1 > 10
  });
  it("seed는 누계를 내리지 않는다(낮은 값 무시)", () => {
    const g = mk();
    g.seed("run1", 6.9);
    g.seed("run1", 1.0); // 더 낮음 → 무시
    expect(() => g.reserve("run1", 0.2)).toThrow(SoftCapPause); // 6.9 기준 유지
  });
  it("seed 안 하면 단계 시작은 0부터(캡 여유)", () => {
    const g = mk();
    expect(g.reserve("run2", 5)).toBeTruthy(); // 0+5 < 7, 통과
  });
});

describe("비용 이중계산 차단(flushLedger §8 · 코드리뷰 P0)", () => {
  const fakeSupa = () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) as never;
  it("이 단계 ledger 실비만 합산(run 누계 미포함) → 이중계산 방지", async () => {
    const ledger = new InMemoryCostLedger();
    ledger.record({ runId: "r1", category: "llm", detail: "a", costUsd: 1.2 });
    ledger.record({ runId: "r1", category: "llm", detail: "b", costUsd: 0.8 });
    ledger.record({ runId: "other", category: "llm", detail: "c", costUsd: 9 }); // 다른 run
    const sum = await flushLedger(fakeSupa(), "r1", ledger);
    expect(sum).toBeCloseTo(2.0); // r1 단계비용만(0.8+1.2), other 제외
    expect(ledger.entries.length).toBe(0); // flush 후 비움
  });
  it("ledger 없으면 0", async () => {
    expect(await flushLedger(fakeSupa(), "r1", undefined)).toBe(0);
  });
});

describe("비용 캡 에러 식별(isCapError · 코드리뷰 P0)", () => {
  it("SoftCapPause/HardCapExceededError는 true", () => {
    expect(isCapError(new SoftCapPause("r", 7, 7))).toBe(true);
    expect(isCapError(new HardCapExceededError("r", 1, 10))).toBe(true);
  });
  it("일반 에러는 false(강등 대상)", () => {
    expect(isCapError(new Error("LLM timeout"))).toBe(false);
    expect(isCapError("string")).toBe(false);
  });
});

describe("표절 임계(scriptGuards · 코드리뷰 P1)", () => {
  it("하드(중단) 임계가 소프트(플래그)보다 높다 — 말투 고정인사 오탐 방지", () => {
    expect(PLAGIARISM_BLOCK_THRESHOLD).toBeGreaterThan(PLAGIARISM_THRESHOLD);
  });
});

describe("검색 어댑터(search)", () => {
  it("mock은 결정적(같은 쿼리 → 같은 결과)", async () => {
    const a = await mockBackend.run({ query: "ISA 비과세 한도" });
    const b = await mockBackend.run({ query: "ISA 비과세 한도" });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
  it("mock 결과는 [MOCK] 표식을 담는다(실사실로 오인 방지)", async () => {
    const r = await mockBackend.run({ query: "파킹통장 금리" });
    expect(r.every((x) => x.content.includes("[MOCK"))).toBe(true);
  });
  it("searchHash는 안정적이고 쿼리에 민감", () => {
    const q = { query: "x", maxResults: 6 };
    expect(searchHash(q)).toBe(searchHash({ ...q }));
    expect(searchHash(q)).not.toBe(searchHash({ query: "y", maxResults: 6 }));
    expect(searchHash(q)).not.toBe(searchHash({ query: "x", maxResults: 3 }));
  });
  it("pickSearchBackend는 env로 선택(기본 mock)", () => {
    const prev = process.env.SEARCH_BACKEND;
    delete process.env.SEARCH_BACKEND;
    expect(pickSearchBackend().name).toBe("mock");
    process.env.SEARCH_BACKEND = "tavily";
    expect(pickSearchBackend().name).toBe("tavily");
    if (prev === undefined) delete process.env.SEARCH_BACKEND;
    else process.env.SEARCH_BACKEND = prev;
  });
});
