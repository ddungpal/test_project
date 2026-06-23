// A/B 썸네일 적재(Phase B) 단위 테스트 — 순수 변환 함수만(DB 무관). 라이브 적재는 scripts/ingest-ab.ts --commit.
import { describe, it, expect } from "vitest";
import { mapVideoToAbRows, AB_METRIC } from "../scripts/ingest-ab.js";
import { judgeComponent, type AbScoreInput } from "../src/performance/abVerdict.js";
import type { AbResultVideo } from "../scripts/learn-ab-style.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };
const CID = "content-uuid-1";

// ISA 3년 만기 — 파일상 A 승자(38.8 > 34.0 > 27.1). 재계산도 A 승자여야.
const ISA: AbResultVideo = {
  topic: "ISA 3년 만기 전략",
  golden_edition: true,
  youtube_video_id: "5f8EtDUXgoQ",
  winner: "A",
  verdict: "decisive",
  variants: [
    { variant: "A", watch_share_pct: 38.8, is_winner: true, copy_main: "절대 깨지 마세요", copy_top: "ISA 계좌 3년 전에", visual: "여성 얼굴+손동작, 검정 배경" },
    { variant: "B", watch_share_pct: 27.1, is_winner: false, copy_main: "이것만 알면 ISA 이해", visual: "얼굴, 긍정/교육 프레이밍" },
    { variant: "C", watch_share_pct: 34.0, is_winner: false, copy_main: "ETF 팔기 전 꼭 알아야 한다", copy_box: "500,000,000원", visual: "얼굴+숫자 강조" },
  ],
};

describe("mapVideoToAbRows — 한 영상 → ab_variants 행 매핑", () => {
  it("모든 변형이 component_type='thumbnail'·content_id 채움", () => {
    const rows = mapVideoToAbRows(ISA, CID, TH);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.component_type).toBe("thumbnail");
      expect(r.content_id).toBe(CID);
    }
  });

  it("watch_share_pct 가 ctr_pct 슬롯에 들어가고 payload.metric 으로 명시(CTR 오기재 방지)", () => {
    const rows = mapVideoToAbRows(ISA, CID, TH);
    const a = rows.find((r) => r.variant === "A");
    expect(a?.ctr_pct).toBe(38.8); // = watch_share_pct
    expect((a?.payload as Record<string, unknown>).metric).toBe(AB_METRIC);
    expect((a?.payload as Record<string, unknown>).metric).toBe("watch_share_pct");
    // impressions 는 Studio 미노출 → null.
    expect(a?.impressions).toBeNull();
    // weight 는 여기서 미산출 → null.
    expect(a?.weight).toBeNull();
  });

  it("payload 에 공개 카피·시각만(거버넌스 §4 — PII 없음)", () => {
    const rows = mapVideoToAbRows(ISA, CID, TH);
    const a = rows.find((r) => r.variant === "A");
    const p = a?.payload as Record<string, unknown>;
    expect(p.copy_top).toBe("ISA 계좌 3년 전에");
    expect(p.copy_main).toBe("절대 깨지 마세요");
    expect(p.visual).toContain("검정 배경");
    // 없는 카피 필드는 키 자체를 넣지 않음(빈 문자열 누출 금지).
    expect(p.copy_box).toBeUndefined();
  });

  it("rank·is_winner 는 judgeComponent 재계산과 정확히 일치(파일 is_winner 맹신 안 함)", () => {
    const rows = mapVideoToAbRows(ISA, CID, TH);
    const scoreInputs: AbScoreInput[] = ISA.variants.map((v) => ({ variant: v.variant, ctr_pct: v.watch_share_pct ?? null, impressions: null }));
    const verdict = judgeComponent("thumbnail", scoreInputs, TH);
    for (const rv of verdict.ranked) {
      const row = rows.find((r) => r.variant === rv.variant);
      expect(row?.rank).toBe(rv.rank);
      expect(row?.is_winner).toBe(rv.is_winner);
    }
    // watch_share 38.8 > 34.0 > 27.1 → A(rank1·winner) > C(rank2) > B(rank3).
    expect(rows.find((r) => r.variant === "A")?.rank).toBe(1);
    expect(rows.find((r) => r.variant === "A")?.is_winner).toBe(true);
    expect(rows.find((r) => r.variant === "C")?.rank).toBe(2);
    expect(rows.find((r) => r.variant === "B")?.rank).toBe(3);
    expect(rows.find((r) => r.variant === "B")?.is_winner).toBe(false);
  });

  it("파일 is_winner 가 재계산 winner 와 다르면 재계산을 따른다(파일 오류 방어)", () => {
    // 파일은 B를 winner라 적었지만 실제 watch_share 는 A가 최고 → 재계산은 A.
    const conflict: AbResultVideo = {
      topic: "충돌 케이스",
      variants: [
        { variant: "A", watch_share_pct: 40.0, is_winner: false, copy_main: "에이" },
        { variant: "B", watch_share_pct: 30.0, is_winner: true, copy_main: "비" },
      ],
    };
    const rows = mapVideoToAbRows(conflict, CID, TH);
    expect(rows.find((r) => r.variant === "A")?.is_winner).toBe(true);
    expect(rows.find((r) => r.variant === "B")?.is_winner).toBe(false);
  });

  it("멱등 — 같은 입력 2회 → 동일 행 배열(재실행 안전)", () => {
    const first = mapVideoToAbRows(ISA, CID, TH);
    const second = mapVideoToAbRows(ISA, CID, TH);
    expect(second).toEqual(first);
  });

  it("onConflict 키(content_id·component_type·variant) 조합이 영상 내 유일(중복 행 없음)", () => {
    const rows = mapVideoToAbRows(ISA, CID, TH);
    const keys = rows.map((r) => `${r.content_id}:${r.component_type}:${r.variant}`);
    expect(new Set(keys).size).toBe(rows.length);
  });
});
