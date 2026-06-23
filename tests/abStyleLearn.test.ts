// A/B 성과 스타일 학습(learn-ab-style) 단위 테스트 — 순수 검증만(DB·LLM 무관).
//   라이브는 scripts/learn-ab-style.ts. 검증: ① buildAbStyleInput 가 inconclusive 영상을 통째 스킵하고
//   winner/loser 를 정확히 분리, ② verdictWeight 가중 순서(decisive>marginal>inconclusive),
//   ③ judgeComponent 재계산이 winner 와 일치(판정 권위).
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAbStyleInput,
  loadReviewedArtifact,
  verdictWeight,
  type AbResultVideo,
} from "../scripts/learn-ab-style.js";
import { judgeComponent, type AbScoreInput } from "../src/performance/abVerdict.js";

/** tmp 파일에 JSON 을 쓰고 경로 반환(loadReviewedArtifact 는 파일 IO 만, DB·LLM 미접근). */
function writeTmpJson(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ab-style-reviewed-"));
  const path = join(dir, "artifact.json");
  writeFileSync(path, JSON.stringify(obj));
  return path;
}

const THRESHOLDS = { decisiveMargin: 0.1, marginalMargin: 0.03 };

// ab-results.json 의 9영상 축약(watch_share_pct 동일). 재계산 margin=(1등-2등)/2등 기준:
//   decisive 3(ISA3년·S&P·연금) + marginal 2(신용카드·나스닥) + inconclusive 4(ETF적립·ISA세금·ISA S&P·결혼).
const VIDEOS: AbResultVideo[] = [
  {
    topic: "ISA 3년", verdict: "decisive", relative_lift_pct: 12.4,
    variants: [
      { variant: "A", watch_share_pct: 38.8, is_winner: true, copy_top: "ISA 계좌 3년 전에", copy_main: "절대 깨지 마세요", visual: "여성 얼굴, 검정 배경" },
      { variant: "B", watch_share_pct: 27.1, copy_main: "이것만 알면 ISA 이해" },
      { variant: "C", watch_share_pct: 34.0, copy_main: "ETF 팔기 전 꼭 알아야 한다", copy_box: "500,000,000원" },
    ],
  },
  {
    topic: "ETF 적립식", verdict: "inconclusive", relative_lift_pct: 2.8,
    variants: [
      { variant: "A", watch_share_pct: 35.0, copy_main: "고점인데 계속 사도 될까?" },
      { variant: "B", watch_share_pct: 36.0, is_winner: true, copy_main: "적립식 투자 계속 해도 되나요?" },
      { variant: "C", watch_share_pct: 29.0, copy_main: "적립식 투자자 필수" },
    ],
  },
  {
    topic: "신용카드", verdict: "marginal", relative_lift_pct: 9.0,
    variants: [
      { variant: "A", watch_share_pct: 34.5, copy_main: "2026 역대급 신상 카드" },
      { variant: "B", watch_share_pct: 37.9, is_winner: true, copy_top: "미친 혜택", copy_main: "역대급 신용카드 등장" },
      { variant: "C", watch_share_pct: 27.6, copy_main: "신용카드 TOP4" },
    ],
  },
  {
    topic: "S&P500", verdict: "decisive", relative_lift_pct: 12.5,
    variants: [
      { variant: "A", watch_share_pct: 31.0, copy_main: "장기 투자해 봤니!" },
      { variant: "B", watch_share_pct: 36.8, is_winner: true, copy_main: "딱 이만큼만 넘으세요", copy_sub: "매일 2만 원씩" },
      { variant: "C", watch_share_pct: 32.2, copy_main: "매일 2만 원씩 다짐한 아이" },
    ],
  },
  {
    topic: "나스닥100", verdict: "marginal", relative_lift_pct: 8.7,
    variants: [
      { variant: "A", watch_share_pct: 36.6, is_winner: true, copy_top: "적립식 투자 그만하라고?", copy_main: "미국 나스닥100 ETF" },
      { variant: "B", watch_share_pct: 33.4, copy_main: "미국 나스닥100 투자" },
      { variant: "C", watch_share_pct: 30.0, copy_main: "미국 나스닥100 ETF 완전히 바뀝니다" },
    ],
  },
  {
    topic: "연금저축", verdict: "decisive", relative_lift_pct: 14.5,
    variants: [
      { variant: "A", watch_share_pct: 28.6, copy_main: "하루라도 어릴 때 만들어야 하는 계좌" },
      { variant: "B", watch_share_pct: 38.5, is_winner: true, copy_top: "무조건 10억 집니다", copy_main: "매달 50만 원씩 넣으세요" },
      { variant: "C", watch_share_pct: 32.9, copy_main: "연금 ETF 50만 원씩 사두" },
    ],
  },
  {
    topic: "ISA 세금", verdict: "inconclusive", relative_lift_pct: 1.5,
    variants: [
      { variant: "A", watch_share_pct: 33.9, copy_main: "ISA에서 이 ETF 사세요" },
      { variant: "B", watch_share_pct: 31.6, copy_main: "ISA에서 ETF 딱 이만큼 사두" },
      { variant: "C", watch_share_pct: 34.4, is_winner: true, copy_main: "ISA 계좌에 ETF 딱 3개만 담으세요" },
    ],
  },
  {
    topic: "ISA S&P", verdict: "inconclusive", relative_lift_pct: 2.8,
    variants: [
      { variant: "A", watch_share_pct: 35.3, is_winner: true, copy_main: "ISA 3년 만기 전략" },
      { variant: "B", watch_share_pct: 30.4, copy_main: "초보들을 위한 총정리" },
      { variant: "C", watch_share_pct: 34.3, copy_main: "ISA에서 S&P500 사는" },
    ],
  },
  {
    topic: "결혼", verdict: "inconclusive", relative_lift_pct: 1.1,
    variants: [
      { variant: "A", watch_share_pct: 35.6, copy_main: "결혼의 중요성" },
      { variant: "B", watch_share_pct: 28.5, copy_main: "평생 함께할 사람을 찾는" },
      { variant: "C", watch_share_pct: 36.0, is_winner: true, copy_main: "결혼은 언제가 하고 싶다면 꼭 보세요" },
    ],
  },
];

describe("verdictWeight (§13.2 가중)", () => {
  it("decisive > marginal > inconclusive 순으로 가중", () => {
    expect(verdictWeight("decisive")).toBe(1.0);
    expect(verdictWeight("marginal")).toBe(0.5);
    expect(verdictWeight("inconclusive")).toBe(0);
    expect(verdictWeight("decisive")).toBeGreaterThan(verdictWeight("marginal"));
    expect(verdictWeight("marginal")).toBeGreaterThan(verdictWeight("inconclusive"));
  });

  it("relative_lift_pct 인자는 선택적이며 기본 가중을 바꾸지 않는다", () => {
    expect(verdictWeight("decisive", 12.4)).toBe(1.0);
    expect(verdictWeight("marginal", 9.0)).toBe(0.5);
  });
});

describe("buildAbStyleInput (prep 순수 헬퍼)", () => {
  it("inconclusive 4영상을 통째 스킵하고 decisive 3 + marginal 2 = 5영상만 남긴다", () => {
    const out = buildAbStyleInput(VIDEOS);
    expect(out).toHaveLength(5);
    const topics = out.map((v) => v.topic).sort();
    expect(topics).toEqual(["ISA 3년", "S&P500", "나스닥100", "신용카드", "연금저축"].sort());
    // inconclusive 영상은 빠졌다.
    expect(out.find((v) => v.topic === "ETF 적립식")).toBeUndefined();
    expect(out.find((v) => v.topic === "결혼")).toBeUndefined();
  });

  it("재계산된 verdict 와 가중치가 영상별로 정확하다", () => {
    const out = buildAbStyleInput(VIDEOS);
    const byTopic = new Map(out.map((v) => [v.topic, v]));
    expect(byTopic.get("ISA 3년")?.verdict).toBe("decisive");
    expect(byTopic.get("ISA 3년")?.weight).toBe(1.0);
    expect(byTopic.get("신용카드")?.verdict).toBe("marginal");
    expect(byTopic.get("신용카드")?.weight).toBe(0.5);
  });

  it("winner 와 losers 를 정확히 분리하고 copy 를 합친다", () => {
    const out = buildAbStyleInput(VIDEOS);
    const isa = out.find((v) => v.topic === "ISA 3년");
    expect(isa).toBeDefined();
    // winner = is_winner:true 변형(A), copy_top + copy_main 합침.
    expect(isa?.winner.copy).toBe("ISA 계좌 3년 전에 / 절대 깨지 마세요");
    expect(isa?.winner.visual).toBe("여성 얼굴, 검정 배경");
    // losers = 나머지 2개(B, C).
    expect(isa?.losers).toHaveLength(2);
    const loserCopies = isa?.losers.map((l) => l.copy);
    expect(loserCopies).toContain("이것만 알면 ISA 이해");
    expect(loserCopies).toContain("ETF 팔기 전 꼭 알아야 한다 / 500,000,000원");
  });
});

describe("loadReviewedArtifact (--from 검수본 로드 순수 헬퍼)", () => {
  // 검수본 실제 형태(ab-style-proposed-*.json) 축약 — copy/visual/banned 구비.
  const REVIEWED = {
    source_ref: "ab-results:videos=5,signal=4.0 @2026-06-23-16-18-50",
    provider: "claude-p",
    videos: [
      { topic: "ISA 3년", verdict: "decisive", weight: 1 },
      { topic: "신용카드", verdict: "marginal", weight: 0.5 },
    ],
    patterns: {
      copy: {
        hook_patterns: ["딱 이만큼만 넘으세요"], // 사람이 완화한 표현
        structure: { description: "2단 구성", main_copy_notes: "짧고 강한 한 호흡", small_box_notes: "상품명·조건" },
        emphasis_words: ["딱", "무조건"],
        length_notes: "짧은 한 줄",
      },
      visual: {
        face: "여성 얼굴 + 손동작",
        layout_archetypes: ["인물 + 노랑 카피"],
        color_usage: "검정 배경 + 노랑 텍스트",
        number_treatment: "구어체 단위(10억)",
        devices: ["손동작", "노랑 강조"],
      },
      banned: ["교육·설명조 카피", "리스트·순위형"],
    },
  };

  it("정상 산출물 → patterns(copy/visual/banned) 보존 + videos/source_ref 유지", () => {
    const path = writeTmpJson(REVIEWED);
    const art = loadReviewedArtifact(path);

    // 사람이 손본 완화 표현이 그대로 보존된다(핵심).
    expect(art.patterns.copy.hook_patterns).toEqual(["딱 이만큼만 넘으세요"]);
    expect(art.patterns.copy.structure.description).toBe("2단 구성");
    expect(art.patterns.copy.emphasis_words).toEqual(["딱", "무조건"]);
    expect(art.patterns.visual.face).toBe("여성 얼굴 + 손동작");
    expect(art.patterns.visual.layout_archetypes).toEqual(["인물 + 노랑 카피"]);
    expect(art.patterns.visual.devices).toEqual(["손동작", "노랑 강조"]);
    expect(art.patterns.banned).toEqual(["교육·설명조 카피", "리스트·순위형"]);

    expect(art.videos).toHaveLength(2);
    expect(art.videos[0]).toEqual({ topic: "ISA 3년", verdict: "decisive", weight: 1 });
    expect(art.source_ref).toBe("ab-results:videos=5,signal=4.0 @2026-06-23-16-18-50");
  });

  it("빈 가능 배열 필드는 ?? [] 로 정규화하고, 비어 있어도 throw 하지 않는다", () => {
    const minimal = {
      source_ref: "x",
      videos: [],
      patterns: {
        copy: { structure: { description: "d", main_copy_notes: "m", small_box_notes: "s" }, length_notes: "l" },
        visual: { face: "f", color_usage: "c", number_treatment: "n" },
        banned: [],
      },
    };
    const art = loadReviewedArtifact(writeTmpJson(minimal));
    expect(art.patterns.copy.hook_patterns).toEqual([]);
    expect(art.patterns.copy.emphasis_words).toEqual([]);
    expect(art.patterns.visual.layout_archetypes).toEqual([]);
    expect(art.patterns.visual.devices).toEqual([]);
    expect(art.patterns.banned).toEqual([]);
  });

  it("patterns(copy/visual/banned) 없는 JSON → throw", () => {
    const noPatterns = writeTmpJson({ source_ref: "x", videos: [] });
    expect(() => loadReviewedArtifact(noPatterns)).toThrow("검수본에 patterns(copy/visual/banned) 없음");

    // banned 키 누락도 throw(copy/visual 만 있고 banned 없음).
    const noBanned = writeTmpJson({
      patterns: {
        copy: { structure: { description: "d", main_copy_notes: "m", small_box_notes: "s" }, length_notes: "l" },
        visual: { face: "f", color_usage: "c", number_treatment: "n" },
      },
    });
    expect(() => loadReviewedArtifact(noBanned)).toThrow("검수본에 patterns(copy/visual/banned) 없음");
  });

  it("videos 없는 JSON → videos:[] + source_ref 자동생성(throw 안 함)", () => {
    const noVideos = {
      patterns: {
        copy: { structure: { description: "d", main_copy_notes: "m", small_box_notes: "s" }, length_notes: "l" },
        visual: { face: "f", color_usage: "c", number_treatment: "n" },
        banned: [],
      },
    };
    const path = writeTmpJson(noVideos);
    const art = loadReviewedArtifact(path);
    expect(art.videos).toEqual([]);
    // source_ref 없으면 from:<basename> @<stamp> 자동생성.
    expect(art.source_ref).toMatch(/^from:artifact\.json @/);
  });
});

describe("judgeComponent 재계산 (판정 권위)", () => {
  it("watch_share_pct 를 ctr_pct 슬롯에 주입하면 decided=true·winner 일치", () => {
    // ISA 3년: A=38.8(승) vs C=34.0 → margin=(38.8-34.0)/34.0≈0.141 → decisive.
    const variants: AbScoreInput[] = VIDEOS[0]!.variants.map((v) => ({
      variant: v.variant,
      ctr_pct: v.watch_share_pct ?? null,
    }));
    const verdict = judgeComponent("thumbnail", variants, THRESHOLDS);
    expect(verdict.decided).toBe(true);
    expect(verdict.winner).toBe("A"); // is_winner:true 변형과 일치.
    expect(verdict.decisiveness).toBe("decisive");
  });

  it("근소차 영상은 inconclusive 로 재계산된다(파일 verdict 무관 권위)", () => {
    // ETF 적립식: B=36.0 vs A=35.0 → margin≈0.0286 < 0.03 → inconclusive.
    const variants: AbScoreInput[] = VIDEOS[1]!.variants.map((v) => ({
      variant: v.variant,
      ctr_pct: v.watch_share_pct ?? null,
    }));
    const verdict = judgeComponent("thumbnail", variants, THRESHOLDS);
    expect(verdict.decisiveness).toBe("inconclusive");
  });
});
