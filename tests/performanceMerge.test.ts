// 성과 적재 필드별 병합 회귀 테스트 — ingestPerformance 를 인메모리 supa 스텁으로 실제 호출.
//   자동수집(views만·ctr=null)과 수동입력(ctr만)이 같은 (content_id,'d7','overall') 행에 써도
//   서로의 필드를 null 로 안 지우는지(필드별 `?? prev` 병합) + 멱등 유지 검증.
import { describe, it, expect } from "vitest";
import { ingestPerformance } from "../src/performance/ingest.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { PerformanceEntry } from "../src/performance/types.js";

const TH = { decisiveMargin: 0.1, marginalMargin: 0.03 };

type Row = Record<string, unknown>;

/** ingest.ts 가 쓰는 최소 체인만 지원하는 인메모리 supabase 스텁. */
function makeSupa() {
  const tables: Record<string, Row[]> = { performance_metrics: [], ab_variants: [], contents: [{ id: "cid1" }] };

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);
    const filters: Array<[string, unknown]> = [];

    const api = {
      select(_cols?: string) {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      // performance_metrics overall 기존행 조회: 배열 반환.
      then(resolve: (r: { data: Row[]; error: null }) => unknown) {
        const data = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
        return Promise.resolve(resolve({ data, error: null }));
      },
      maybeSingle() {
        const data = rows.filter((r) => filters.every(([c, v]) => r[c] === v))[0] ?? null;
        return Promise.resolve({ data, error: null });
      },
      upsert(newRows: Row[], opts: { onConflict: string }) {
        const keys = opts.onConflict.split(",").map((k) => k.trim());
        for (const nr of newRows) {
          const idx = rows.findIndex((r) => keys.every((k) => r[k] === nr[k]));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...nr };
          else rows.push({ ...nr });
        }
        return Promise.resolve({ error: null });
      },
      update(_patch: Row) {
        // contents.ab_* no-op (ab 없으면 호출 안 됨).
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
    return api;
  }

  return { supa: { from } as unknown as Supa, tables };
}

function entry(metric: PerformanceEntry["metrics"][number]): PerformanceEntry {
  return { content_id: "cid1", metrics: [metric] };
}

function d7overall(tables: Record<string, Row[]>): Row[] {
  return (tables.performance_metrics ?? []).filter((r) => r.metric_window === "d7" && r.ab_variant === "overall");
}

describe("performance_metrics 필드별 병합 upsert", () => {
  it("자동→수동 순서: 자동수집 views 후 수동 ctr 적재 → 둘 다 보존", async () => {
    const { supa, tables } = makeSupa();
    await ingestPerformance(supa, [entry({ window: "d7", views: 1000, ctr: null })], TH, { nowIso: "2026-07-16T00:00:00Z" });
    await ingestPerformance(supa, [entry({ window: "d7", ctr: 3.8 })], TH, { nowIso: "2026-07-16T01:00:00Z" }); // views 미제공(undefined)
    const rows = d7overall(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.views).toBe(1000);
    expect(rows[0]?.ctr).toBe(3.8);
  });

  it("수동→자동 순서: 수동 ctr 후 자동수집 views 적재 → 자동이 ctr 안 지움", async () => {
    const { supa, tables } = makeSupa();
    await ingestPerformance(supa, [entry({ window: "d7", ctr: 3.8 })], TH, { nowIso: "2026-07-16T00:00:00Z" });
    await ingestPerformance(supa, [entry({ window: "d7", views: 1000, ctr: null })], TH, { nowIso: "2026-07-16T01:00:00Z" });
    const rows = d7overall(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.views).toBe(1000);
    expect(rows[0]?.ctr).toBe(3.8);
  });

  it("멱등: 같은 {views, ctr} 2회 적재 → 값·행수 불변", async () => {
    const { supa, tables } = makeSupa();
    const m = entry({ window: "d7", views: 1000, ctr: 3.8 });
    await ingestPerformance(supa, [m], TH, { nowIso: "2026-07-16T00:00:00Z" });
    await ingestPerformance(supa, [m], TH, { nowIso: "2026-07-16T01:00:00Z" });
    const rows = d7overall(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.views).toBe(1000);
    expect(rows[0]?.ctr).toBe(3.8);
  });

  it("manual.json 하위호환: views·ctr·avg_view_pct 다 제공 시 세 값 다 반영", async () => {
    const { supa, tables } = makeSupa();
    await ingestPerformance(supa, [entry({ window: "d7", views: 500, ctr: 6.4, avg_view_pct: 38.5 })], TH, {
      nowIso: "2026-07-16T00:00:00Z",
    });
    const rows = d7overall(tables);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.views).toBe(500);
    expect(rows[0]?.ctr).toBe(6.4);
    expect(rows[0]?.avg_view_pct).toBe(38.5);
  });
});
