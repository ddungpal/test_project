// 단독 실행 시더(seedStandaloneRun) — 통합형 in-memory fake Supa로 시드 결과를 검증한다.
//   ★ 핵심: 시드한 selection이 getSelectedStagePayload 계약(candidates[0].idx===0, chosen_idx===0)을
//     정확히 만족해 그 함수로 시드값이 읽혀야 한다. 시드 안 한 stage는 null.
//   ★ callLLM 0회: seed.ts 소스가 llm/callLLM을 import하지 않음을 구조적으로 단언(+통합 경로엔 LLM 자체가 없음).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { seedStandaloneRun } from "../src/pipeline/standalone/seed.js";
import { getSelectedStagePayload } from "../src/pipeline/context.js";
import type { Supa } from "../src/pipeline/runState.js";

// ── 통합형 in-memory fake Supa ───────────────────────────────────────────────
// contents / production_runs / stage_proposals / stage_selections 4테이블을 행 배열로 저장하고,
//   seed.ts·transitionRun·getSelectedStagePayload가 쓰는 쿼리 체인만 흉내낸다.
interface Row {
  id: string;
  [k: string]: unknown;
}
interface Store {
  contents: Row[];
  production_runs: Row[];
  stage_proposals: Row[];
  stage_selections: Row[];
}

function makeSupa() {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const store: Store = { contents: [], production_runs: [], stage_proposals: [], stage_selections: [] };

  // select 체인: 누적 eq 필터 + order/limit를 적용해 행을 거른다.
  function selectChain(table: keyof Store, _cols: string) {
    const filters: Array<[string, unknown]> = [];
    let ordered = false;
    const apply = (): Row[] => {
      let rows = store[table].filter((r) => filters.every(([c, v]) => r[c] === v));
      if (ordered) rows = [...rows].reverse(); // created_at desc 근사(삽입 역순).
      return rows;
    };
    const chain: Record<string, unknown> = {
      eq(c: string, v: unknown) {
        filters.push([c, v]);
        return chain;
      },
      order() {
        ordered = true;
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle: async () => {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
    };
    return chain;
  }

  const supa = {
    from(table: keyof Store) {
      return {
        insert(payload: Record<string, unknown>) {
          const row: Row = { id: id(`${table}_`), ...payload };
          // production_runs.state는 트리거가 'created' 강제 → insert엔 state 없음을 모사.
          if (table === "production_runs" && row.state === undefined) row.state = "created";
          store[table].push(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: row.id }, error: null }),
            }),
          };
        },
        // transitionRun: update({state}).eq("id",runId).eq("state",from).select("id")
        update(patch: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          const eqChain: Record<string, unknown> = {
            eq(c: string, v: unknown) {
              filters.push([c, v]);
              return eqChain;
            },
            select: async () => {
              const rows = store[table].filter((r) => filters.every(([c, v]) => r[c] === v));
              for (const r of rows) Object.assign(r, patch);
              return { data: rows.map((r) => ({ id: r.id })), error: null };
            },
          };
          return eqChain;
        },
        select: (cols: string) => selectChain(table, cols),
      };
    },
  } as unknown as Supa;

  return { supa, store };
}

function stateOf(store: Store, runId: string): string {
  return store.production_runs.find((r) => r.id === runId)!.state as string;
}

describe("seedStandaloneRun — 단독 실행 시더", () => {
  it("research 타깃: state=structure_selected, topic·structure 시드값 정확 반환, thumbnail은 null", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "research", {
      topic: "2030 재테크",
      structure: "인트로 → 공포 → 해소 → 행동",
    });

    expect(stateOf(store, runId)).toBe("structure_selected");
    expect(store.production_runs.find((r) => r.id === runId)!.is_standalone).toBe(true);

    expect(await getSelectedStagePayload(supa, runId, "topic")).toEqual({ title: "2030 재테크" });
    const structure = (await getSelectedStagePayload(supa, runId, "structure")) as {
      approach: string;
      outline: Array<{ section: string }>;
    };
    expect(structure.approach).toBe("사용자 입력 구성");
    expect(structure.outline[0]?.section).toBe("인트로 → 공포 → 해소 → 행동");

    // 시드 안 한 단계는 null.
    expect(await getSelectedStagePayload(supa, runId, "thumbnail")).toBeNull();
  });

  it("title_thumb 타깃: topic_selected까지만 walk, 주제만 시드", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "title_thumb", { topic: "월 100 모으기" });

    expect(stateOf(store, runId)).toBe("topic_selected");
    expect(await getSelectedStagePayload(supa, runId, "topic")).toEqual({ title: "월 100 모으기" });
    expect(await getSelectedStagePayload(supa, runId, "title_thumb")).toBeNull();
  });

  it("structure 타깃: 제목(optional) 미입력이면 생략, 주제만 시드", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "structure", { topic: "절약 습관" });

    expect(stateOf(store, runId)).toBe("thumbnails_selected");
    expect(await getSelectedStagePayload(supa, runId, "topic")).toEqual({ title: "절약 습관" });
    // 제목은 optional·미입력 → selection 없음.
    expect(await getSelectedStagePayload(supa, runId, "title_thumb")).toBeNull();
  });

  it("structure 타깃: 제목(optional) 입력하면 함께 시드", async () => {
    const { supa } = makeSupa();
    const runId = await seedStandaloneRun(supa, "structure", { topic: "절약 습관", title: "한 달에 50 모은 법" });
    expect(await getSelectedStagePayload(supa, runId, "title_thumb")).toEqual({ title: "한 달에 50 모은 법" });
  });

  it("필수 입력(주제) 누락이면 throw", async () => {
    const { supa } = makeSupa();
    await expect(seedStandaloneRun(supa, "research", { structure: "구성만 있음" })).rejects.toThrow(/주제/);
  });

  it("research 필수 구성 누락이면 throw", async () => {
    const { supa } = makeSupa();
    await expect(seedStandaloneRun(supa, "research", { topic: "주제만" })).rejects.toThrow(/구성/);
  });

  it("script 타깃은 throw(step3 격리)", async () => {
    const { supa } = makeSupa();
    await expect(seedStandaloneRun(supa, "script", { structure: "x", facts: "y" })).rejects.toThrow(/step3/);
  });
});

describe("seedStandaloneRun — callLLM 0회(구조적 보장)", () => {
  it("seed.ts 소스가 llm/callLLM을 import하지 않는다", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../src/pipeline/standalone/seed.ts"), "utf8");
    const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    const imports = importLines.join("\n");
    expect(imports).not.toMatch(/callLLM/i);
    expect(imports).not.toMatch(/\/llm\//);
  });
});
