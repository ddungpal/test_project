// 교정쌍 재학습 합류(thumbnail-correction-learning step2) 단위 테스트 — 순수 로직 + fake Supa.
//   ① buildAbStyleInput correction 경로: 이상=winner·생성=loser, verdict="decisive"·weight=1.0, CTR 없어도 스킵 안 됨.
//   ② loadCorrectionResults: thumbnail_corrections → AbResultVideo 변환(variants 2개·is_winner·learn_mode·topic 폴백).
//   ③ countUnlearnedCorrections 기반 적격: 미학습 교정 존재 → 적격 / 없으면 기존 동작 불변.
import { describe, it, expect } from "vitest";
import { buildAbStyleInput, verdictWeight, type AbResultVideo } from "../scripts/learn-ab-style.js";
import { loadCorrectionResults } from "../src/performance/correctionLearnSource.js";
import type { Supa } from "../src/pipeline/runState.js";

// ── ① buildAbStyleInput correction 경로 ──
describe("buildAbStyleInput — correction 경로(교정쌍 → decisive 고정 가중)", () => {
  const CORRECTION: AbResultVideo[] = [
    {
      topic: "ISA 교정",
      learn_mode: "correction",
      variants: [
        { variant: "A", is_winner: true, copy_top: "ISA 계좌", copy_main: "절대 깨지 마세요" }, // 이상
        { variant: "B", is_winner: false, copy_main: "ISA 계좌 깨지 마라" }, // 생성
      ],
    },
  ];

  it("CTR 없어도 스킵하지 않는다(single 처럼 — judgeComponent 안 탐)", () => {
    const out = buildAbStyleInput(CORRECTION, "thumbnail");
    expect(out).toHaveLength(1);
    expect(out[0]?.topic).toBe("ISA 교정");
  });

  it("verdict='decisive' · weight=1.0 고정(verdictWeight('decisive'))", () => {
    const out = buildAbStyleInput(CORRECTION, "thumbnail");
    expect(out[0]?.verdict).toBe("decisive");
    expect(out[0]?.weight).toBe(verdictWeight("decisive"));
    expect(out[0]?.weight).toBe(1.0);
  });

  it("이상=winner·생성=loser 카피를 정확히 분리한다", () => {
    const out = buildAbStyleInput(CORRECTION, "thumbnail");
    expect(out[0]?.winner.copy).toBe("ISA 계좌 / 절대 깨지 마세요");
    expect(out[0]?.losers).toHaveLength(1);
    expect(out[0]?.losers[0]?.copy).toBe("ISA 계좌 깨지 마라");
  });

  it("winner 변형이 없으면 그 영상은 스킵된다(throw 없음)", () => {
    const noWinner: AbResultVideo[] = [
      {
        topic: "winner 없음",
        learn_mode: "correction",
        variants: [
          { variant: "A", is_winner: false, copy_main: "a" },
          { variant: "B", is_winner: false, copy_main: "b" },
        ],
      },
    ];
    expect(buildAbStyleInput(noWinner, "thumbnail")).toEqual([]);
  });

  it("제목 교정도 동일하게 동작한다(component='title')", () => {
    const titleCorr: AbResultVideo[] = [
      {
        topic: "제목 교정",
        learn_mode: "correction",
        variants: [
          { variant: "A", is_winner: true, copy_main: "딱 이만큼만 넘으세요" },
          { variant: "B", is_winner: false, copy_main: "이만큼만 넘어라" },
        ],
      },
    ];
    const out = buildAbStyleInput(titleCorr, "title");
    expect(out).toHaveLength(1);
    expect(out[0]?.verdict).toBe("decisive");
    expect(out[0]?.weight).toBe(1.0);
    expect(out[0]?.winner.copy).toBe("딱 이만큼만 넘으세요");
    expect(out[0]?.losers[0]?.copy).toBe("이만큼만 넘어라");
  });
});

// ── ② loadCorrectionResults: fake Supa 로 thumbnail_corrections 변환 ──
interface CorrRow {
  id: string;
  component_type: "title" | "thumbnail";
  topic: string | null;
  gen_payload: unknown;
  ideal_payload: unknown;
  learned_at: string | null;
}

/** thumbnail_corrections 만 흉내내는 최소 fake Supa(select.eq.is 체이닝 + count head). */
function makeCorrectionSupa(rows: CorrRow[]): Supa {
  const builder = () => {
    const filters: Array<[string, unknown]> = [];
    let headCount = false;
    const matched = () =>
      rows.filter((r) => filters.every(([col, val]) => (r as unknown as Record<string, unknown>)[col] === val));

    const api = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) headCount = true;
        return api;
      },
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      is: (col: string, val: unknown) => {
        filters.push([col, val]);
        return api;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const m = matched();
        const result = headCount
          ? { count: m.length, error: null }
          : {
              data: m.map((r) => ({
                id: r.id,
                topic: r.topic,
                gen_payload: r.gen_payload,
                ideal_payload: r.ideal_payload,
              })),
              error: null,
            };
        return Promise.resolve(result).then(res, rej);
      },
    };
    return api;
  };
  return { from: () => builder() } as unknown as Supa;
}

describe("loadCorrectionResults — thumbnail_corrections → AbResultVideo 변환", () => {
  it("교정쌍 1행 → variants 2개(이상=A winner / 생성=B loser)·learn_mode='correction'", async () => {
    const supa = makeCorrectionSupa([
      {
        id: "c1",
        component_type: "thumbnail",
        topic: "ISA 3년",
        ideal_payload: { copy_main: ["절대 깨지 마세요"], copy_boxes: ["3년 만기"] },
        gen_payload: { copy_main: ["깨지 마라"], copy_boxes: ["만기"] },
        learned_at: null,
      },
    ]);
    const out = await loadCorrectionResults(supa, "thumbnail");
    expect(out).toHaveLength(1);
    expect(out[0]?.learn_mode).toBe("correction");
    expect(out[0]?.topic).toBe("ISA 3년");
    expect(out[0]?.variants).toHaveLength(2);
    const [a, b] = out[0]!.variants;
    expect(a?.variant).toBe("A");
    expect(a?.is_winner).toBe(true);
    expect(a?.copy_main).toBe("절대 깨지 마세요"); // 이상
    expect(b?.variant).toBe("B");
    expect(b?.is_winner).toBe(false);
    expect(b?.copy_main).toBe("깨지 마라"); // 생성
  });

  it("topic 이 null 이면 '(교정)' 폴백을 쓴다", async () => {
    const supa = makeCorrectionSupa([
      {
        id: "c2",
        component_type: "thumbnail",
        topic: null,
        ideal_payload: { copy_main: ["이상"], copy_boxes: [] },
        gen_payload: { copy_main: ["생성"], copy_boxes: [] },
        learned_at: null,
      },
    ]);
    const out = await loadCorrectionResults(supa, "thumbnail");
    expect(out[0]?.topic).toBe("(교정)");
  });

  it("learned/unlearned 모두 로드한다(멱등은 learned_at 스탬프 담당)", async () => {
    const supa = makeCorrectionSupa([
      { id: "c1", component_type: "thumbnail", topic: "a", ideal_payload: { copy_main: ["i"], copy_boxes: [] }, gen_payload: { copy_main: ["g"], copy_boxes: [] }, learned_at: null },
      { id: "c2", component_type: "thumbnail", topic: "b", ideal_payload: { copy_main: ["i"], copy_boxes: [] }, gen_payload: { copy_main: ["g"], copy_boxes: [] }, learned_at: "2026-06-01T00:00:00Z" },
    ]);
    const out = await loadCorrectionResults(supa, "thumbnail");
    expect(out).toHaveLength(2); // 이미 학습된 것도 로드(전부 읽음).
  });

  it("교정 0건이면 빈 배열(하위호환 — sweep 기존 동작 불변)", async () => {
    const supa = makeCorrectionSupa([]);
    expect(await loadCorrectionResults(supa, "thumbnail")).toEqual([]);
  });

  it("제목 교정은 payload.title → copy_main 으로 복원한다", async () => {
    const supa = makeCorrectionSupa([
      {
        id: "t1",
        component_type: "title",
        topic: "제목",
        ideal_payload: { title: "딱 이만큼만 넘으세요" },
        gen_payload: { title: "이만큼만 넘어라" },
        learned_at: null,
      },
    ]);
    const out = await loadCorrectionResults(supa, "title");
    expect(out[0]?.variants[0]?.copy_main).toBe("딱 이만큼만 넘으세요");
    expect(out[0]?.variants[1]?.copy_main).toBe("이만큼만 넘어라");
  });

  it("component='thumbnail' 이면 component_type='thumbnail' 행만 조회한다(title 격리)", async () => {
    const supa = makeCorrectionSupa([
      { id: "th1", component_type: "thumbnail", topic: "th", ideal_payload: { copy_main: ["i"], copy_boxes: [] }, gen_payload: { copy_main: ["g"], copy_boxes: [] }, learned_at: null },
      { id: "ti1", component_type: "title", topic: "ti", ideal_payload: { title: "i" }, gen_payload: { title: "g" }, learned_at: null },
    ]);
    const out = await loadCorrectionResults(supa, "thumbnail");
    expect(out).toHaveLength(1);
    expect(out[0]?.topic).toBe("th");
  });
});
