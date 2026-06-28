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
  research_facts: Row[];
  explanation_assets: Row[];
}

function makeSupa() {
  let seq = 0;
  const id = (p: string) => `${p}${++seq}`;
  const store: Store = {
    contents: [],
    production_runs: [],
    stage_proposals: [],
    stage_selections: [],
    research_facts: [],
    explanation_assets: [],
  };

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

});

// ── script 타깃: research_facts/explanation_assets 시드(money-safety) ─────────
// scriptCell.ts:53-81 게이트를 그대로 재현해 시드 행이 usable 필터를 통과하는지 검증한다.
//   usable fact = human_approved===true || (escalated_to_human===false && verification_status==="verified")
//   usable asset = kind==="number" ? math_verified===true : distortion_checked===true
function usableFacts(store: Store, runId: string): Row[] {
  return store.research_facts
    .filter((f) => f.run_id === runId)
    .filter((f) => f.human_approved === true || (f.escalated_to_human === false && f.verification_status === "verified"));
}
function usableAssets(store: Store, runId: string): Row[] {
  return store.explanation_assets
    .filter((a) => a.run_id === runId)
    .filter((a) => (a.kind === "number" ? a.math_verified === true : a.distortion_checked === true));
}

describe("seedStandaloneRun — script 타깃(facts/assets 시드)", () => {
  it("시드 후 run.state === research_approved", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", {
      structure: "인트로 → 본론 → 마무리",
      facts: "사실 A",
    });
    expect(stateOf(store, runId)).toBe("research_approved");
    expect(store.production_runs.find((r) => r.id === runId)!.is_standalone).toBe(true);
  });

  it("structure selection이 getSelectedStagePayload로 정확히 읽힘", async () => {
    const { supa } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", {
      structure: "공포 → 해소",
      facts: "사실 A",
    });
    const structure = (await getSelectedStagePayload(supa, runId, "structure")) as {
      approach: string;
      outline: Array<{ section: string }>;
    };
    expect(structure.approach).toBe("사용자 입력 구성");
    expect(structure.outline[0]?.section).toBe("공포 → 해소");
  });

  it("research_facts: 여러 줄 → 여러 행, 모두 usable 필터(human_approved===true) 통과", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", {
      structure: "구성",
      facts: "첫째 사실\n둘째 사실\n  \n셋째 사실",
    });
    // 빈 줄(공백만)은 무시 → 3행.
    const seeded = store.research_facts.filter((f) => f.run_id === runId);
    expect(seeded).toHaveLength(3);
    expect(seeded.map((f) => f.claim)).toEqual(["첫째 사실", "둘째 사실", "셋째 사실"]);
    // 시드 fact는 verified가 아니라 human_approved=true로 통과(거짓 검증 금지).
    for (const f of seeded) {
      expect(f.verification_status).toBe("unverified");
      expect(f.human_approved).toBe(true);
    }
    expect(usableFacts(store, runId)).toHaveLength(3);
  });

  it("explanation_assets: number 줄=math_verified, analogy 줄=distortion_checked, 둘 다 usable 통과", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", {
      structure: "구성",
      facts: "사실 A",
      assets: "number|복리|월 10만원 30년=약 1억\nanalogy|복리|눈덩이 굴리기",
    });
    const num = store.explanation_assets.find((a) => a.kind === "number" && a.run_id === runId)!;
    const ana = store.explanation_assets.find((a) => a.kind === "analogy" && a.run_id === runId)!;
    expect(num.math_verified).toBe(true);
    expect(num.numeric_example).toBe("월 10만원 30년=약 1억");
    expect(num.concept).toBe("복리");
    expect(ana.distortion_checked).toBe(true);
    expect(ana.analogy).toBe("눈덩이 굴리기");
    expect(usableAssets(store, runId)).toHaveLength(2);
  });

  it("플래그 false인 자산(직접 삽입)은 usable 필터에서 제외", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", {
      structure: "구성",
      facts: "사실 A",
      assets: "number|개념|검증된 숫자",
    });
    // 직접 미검증 자산 삽입(시드 경로 아님) → usable에서 빠져야 함.
    store.explanation_assets.push({ id: "asset_x", run_id: runId, concept: "X", kind: "number", math_verified: false });
    store.explanation_assets.push({ id: "asset_y", run_id: runId, concept: "Y", kind: "analogy", distortion_checked: false });
    expect(usableAssets(store, runId)).toHaveLength(1); // 시드한 1개만.
  });

  it("assets 미입력이면 0행(짠펜은 facts만으로 동작)", async () => {
    const { supa, store } = makeSupa();
    const runId = await seedStandaloneRun(supa, "script", { structure: "구성", facts: "사실 A" });
    expect(store.explanation_assets.filter((a) => a.run_id === runId)).toHaveLength(0);
  });

  it("facts 누락(required)이면 throw", async () => {
    const { supa } = makeSupa();
    await expect(seedStandaloneRun(supa, "script", { structure: "구성" })).rejects.toThrow(/검증된 사실/);
  });

  it("facts가 공백 줄만이면 throw(유효 행 0)", async () => {
    const { supa } = makeSupa();
    await expect(seedStandaloneRun(supa, "script", { structure: "구성", facts: "  \n \n" })).rejects.toThrow(/검증된 사실/);
  });

  it("assets kind가 number/analogy가 아니면 throw", async () => {
    const { supa } = makeSupa();
    await expect(
      seedStandaloneRun(supa, "script", { structure: "구성", facts: "사실 A", assets: "graph|개념|뭔가" }),
    ).rejects.toThrow(/kind/);
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
