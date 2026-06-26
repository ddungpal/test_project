// styleRelearnSweep 교정 합류 end-to-end(thumbnail-correction-learning step2) — 인메모리 fake Supa + learnAbStylePatterns mock.
//   검증: ① 미학습 교정 존재 → 적격(ab 불변이어도) → draft 생성 + learned_at 스탬프.
//          ② 전부 학습됨 + ab 불변 → skip(LLM·draft·스탬프 0).
//          ③ 하위호환: 교정 0건 + ab 불변 → skip(기존 동작 불변).
//          ④ 교정만 있고 ab_variants=0 → 학습 진행(교정이 videos 에 들어옴).
//   ★ learnAbStylePatterns 는 mock(LLM·fixture 미접근 — 과금 0). 교정 변환(loadCorrectionResults)·적격·스탬프만 검증.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmConfig } from "../src/llm/config.js";

// learnAbStylePatterns 를 스텁(LLM 호출 차단). vi.mock 은 hoist 되므로 spy 는 vi.hoisted 로 끌어올린다.
//   인자 타입을 명시(videos, component)해 mock.calls 추론이 빈 튜플이 되지 않게 한다.
const { learnSpy } = vi.hoisted(() => ({
  learnSpy: vi.fn(async (_videos: { learn_mode?: string }[], _component?: string) => ({
    patterns: { copy: {}, visual: {}, banned: [] } as never,
    evidence_summary: "stub",
    inputVideos: [],
    signalCount: 0,
    provider: "stub",
    promptHash: "h",
    costUsd: 0,
  })),
}));
vi.mock("../scripts/learn-ab-style.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../scripts/learn-ab-style.js")>();
  return { ...orig, learnAbStylePatterns: learnSpy };
});

import { styleRelearnSweep } from "../src/performance/styleRelearn.js";
import type { Supa } from "../src/pipeline/runState.js";

interface AbVariantRow {
  id: string;
  content_id: string;
  component_type: "title" | "thumbnail";
  variant: "A" | "B" | "C";
  payload: unknown;
  ctr_pct: number | null;
  is_winner: boolean;
  weight: number | null;
}
interface StyleProfileRow {
  id: string;
  component_type: "title" | "thumbnail_copy" | "description";
  version: number;
  patterns: unknown;
  status: string;
}
interface PtsRow {
  id: string;
  style_profile_id: string;
  profile_type: string;
}
interface CorrRow {
  id: string;
  component_type: "title" | "thumbnail";
  topic: string | null;
  gen_payload: unknown;
  ideal_payload: unknown;
  learned_at: string | null;
}

interface Db {
  ab_variants: AbVariantRow[];
  style_profiles: StyleProfileRow[];
  profile_training_sources: PtsRow[];
  thumbnail_corrections: CorrRow[];
  contents: { id: string; title: string | null; topic: string | null }[];
  performance_metrics: { content_id: string; metric_window: string; ab_variant: string; ctr: number | null; views: number | null }[];
}

let idSeq = 0;
function newId(prefix: string): string {
  return `${prefix}-${++idSeq}`;
}

/** styleRelearnSweep 가 호출하는 supa 경로를 흉내내는 인메모리 fake(insert 는 db 배열에 반영 → 멱등·스탬프 검증). */
function makeFakeSupa(db: Db): Supa {
  const builder = (table: keyof Db) => {
    const filters: Array<[string, unknown]> = [];
    const isNullFilters: string[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let headCount = false;
    let insertPayload: unknown = null;
    let updatePatch: Record<string, unknown> | null = null;
    let orderDesc = false;

    const rowsOf = (): Record<string, unknown>[] => db[table] as unknown as Record<string, unknown>[];
    const match = (r: Record<string, unknown>) =>
      filters.every(([c, v]) => r[c] === v) && isNullFilters.every((c) => r[c] === null);

    const runWrite = () => {
      if (op === "insert") {
        const arr = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
        const inserted = arr.map((raw) => {
          const row = { id: newId(String(table)), ...(raw as Record<string, unknown>) };
          rowsOf().push(row);
          return row;
        });
        return { rows: inserted };
      }
      if (op === "update") {
        for (const r of rowsOf()) if (match(r)) Object.assign(r, updatePatch);
        return { rows: [] };
      }
      if (op === "delete") {
        const keep = rowsOf().filter((r) => !match(r));
        (db[table] as unknown as Record<string, unknown>[]).length = 0;
        (db[table] as unknown as Record<string, unknown>[]).push(...keep);
        return { rows: [] };
      }
      return { rows: rowsOf().filter(match) };
    };

    const api: Record<string, unknown> = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) headCount = true;
        return api;
      },
      insert: (payload: unknown) => {
        op = "insert";
        insertPayload = payload;
        return api;
      },
      update: (patch: Record<string, unknown>) => {
        op = "update";
        updatePatch = patch;
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return api;
      },
      in: (c: string, vals: unknown[]) => {
        filters.push([c, vals]); // contents/perf 조인용(미사용 경로) — 단순 통과.
        return api;
      },
      is: (c: string, _v: null) => {
        isNullFilters.push(c);
        return api;
      },
      order: () => {
        orderDesc = true;
        return api;
      },
      limit: () => api,
      maybeSingle: () => {
        const matched = rowsOf().filter(match);
        if (orderDesc) matched.sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      single: () => {
        const { rows } = runWrite();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const { rows } = runWrite();
        const result = headCount ? { count: rows.length, error: null } : { data: rows, error: null };
        return Promise.resolve(result).then(res, rej);
      },
    };
    return api;
  };
  return { from: (t: keyof Db) => builder(t) } as unknown as Supa;
}

function emptyDb(): Db {
  return {
    ab_variants: [],
    style_profiles: [],
    profile_training_sources: [],
    thumbnail_corrections: [],
    contents: [],
    performance_metrics: [],
  };
}

const CONFIG = {
  ab: { decisiveMargin: 0.1, marginalMargin: 0.03, ctrNormCap: 10, ctrBoostFactor: 0.3, viewsConfFloor: 0.5 },
  softCapUsd: 7,
  hardCapUsd: 10,
} as unknown as LlmConfig;

beforeEach(() => {
  learnSpy.mockClear();
  idSeq = 0;
});

describe("styleRelearnSweep — 교정 합류 적격 + learned_at 스탬프", () => {
  it("미학습 교정 존재 → ab 불변이어도 적격: draft 생성 + 교정 learned_at 스탬프", async () => {
    const db = emptyDb();
    db.thumbnail_corrections.push({
      id: "c1",
      component_type: "thumbnail",
      topic: "교정1",
      ideal_payload: { copy_main: ["이상"], copy_boxes: [] },
      gen_payload: { copy_main: ["생성"], copy_boxes: [] },
      learned_at: null,
    });
    const supa = makeFakeSupa(db);

    const res = await styleRelearnSweep(supa, { config: CONFIG });

    expect(res.thumbnail.eligible).toBe(true);
    expect(res.thumbnail.created).not.toBeNull(); // draft 생성됨.
    expect(learnSpy).toHaveBeenCalled(); // 교정이 videos 로 합류 → 학습 본체 호출.
    // 스탬프: learned_at 채워짐(멱등 — 다음 sweep 에서 미학습 0).
    expect(db.thumbnail_corrections[0]?.learned_at).not.toBeNull();
    // draft 1건 + status='draft'.
    const drafts = db.style_profiles.filter((s) => s.component_type === "thumbnail_copy");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe("draft");
  });

  it("전부 학습된 교정 + ab_variants 불변 → skip(LLM·draft·스탬프 0)", async () => {
    const db = emptyDb();
    db.thumbnail_corrections.push({
      id: "c1",
      component_type: "thumbnail",
      topic: "이미학습",
      ideal_payload: { copy_main: ["이상"], copy_boxes: [] },
      gen_payload: { copy_main: ["생성"], copy_boxes: [] },
      learned_at: "2026-06-01T00:00:00Z", // 이미 학습됨.
    });
    const supa = makeFakeSupa(db);

    const res = await styleRelearnSweep(supa, { config: CONFIG });

    expect(res.thumbnail.eligible).toBe(false); // ab 불변(0→0) + 미학습 교정 0 → skip.
    expect(res.thumbnail.created).toBeNull();
    expect(learnSpy).not.toHaveBeenCalled();
    expect(db.style_profiles).toHaveLength(0);
  });

  it("하위호환: 교정 0건 + ab_variants 불변 → 기존대로 skip(회귀 0)", async () => {
    const db = emptyDb(); // 교정도 ab 도 전무.
    const supa = makeFakeSupa(db);

    const res = await styleRelearnSweep(supa, { config: CONFIG });

    expect(res.thumbnail.eligible).toBe(false);
    expect(res.title.eligible).toBe(false);
    expect(res.thumbnail.created).toBeNull();
    expect(learnSpy).not.toHaveBeenCalled();
  });

  it("교정만 있고 ab_variants=0 → 학습 진행(교정이 videos 에 들어옴)", async () => {
    const db = emptyDb();
    db.thumbnail_corrections.push({
      id: "c1",
      component_type: "thumbnail",
      topic: "교정만",
      ideal_payload: { copy_main: ["이상"], copy_boxes: [] },
      gen_payload: { copy_main: ["생성"], copy_boxes: [] },
      learned_at: null,
    });
    const supa = makeFakeSupa(db);

    const res = await styleRelearnSweep(supa, { config: CONFIG });

    expect(res.thumbnail.created).not.toBeNull();
    // learnAbStylePatterns 에 넘어간 videos 에 교정쌍(learn_mode='correction')이 포함됐는지.
    const passedVideos = learnSpy.mock.calls.find((c) => c[1] === "thumbnail")?.[0];
    expect(passedVideos?.some((v) => v.learn_mode === "correction")).toBe(true);
  });

  it("스탬프는 학습된 component 만 — 제목 교정은 thumbnail sweep 에서 안 건드린다(격리)", async () => {
    const db = emptyDb();
    db.thumbnail_corrections.push(
      { id: "th", component_type: "thumbnail", topic: "썸", ideal_payload: { copy_main: ["i"], copy_boxes: [] }, gen_payload: { copy_main: ["g"], copy_boxes: [] }, learned_at: null },
      { id: "ti", component_type: "title", topic: "제목", ideal_payload: { title: "i" }, gen_payload: { title: "g" }, learned_at: null },
    );
    const supa = makeFakeSupa(db);

    await styleRelearnSweep(supa, { config: CONFIG });

    // thumbnail·title 둘 다 적격이라 각자 스탬프됨(둘 다 미학습 교정 존재).
    expect(db.thumbnail_corrections.find((c) => c.id === "th")?.learned_at).not.toBeNull();
    expect(db.thumbnail_corrections.find((c) => c.id === "ti")?.learned_at).not.toBeNull();
  });
});
