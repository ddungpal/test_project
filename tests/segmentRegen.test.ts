// 짠펜 단일 세그먼트 재생성(regenerateSegment) — fake supa로 DB 스코프 불변식 검증.
//   ★ 핵심 불변식:
//     (a) script_segments update는 run_id+id 두 스코프로만 — 다른 세그먼트 안 건드림(전량 delete-insert 없음).
//     (b) lineage(facts/assets)는 그 세그먼트 것만 재설정 — delete/insert 모두 .eq("segment_id", segmentId) 스코프.
//     (c) 짠펜 부분 모드 입력에 reason + 이웃 맥락(neighbors) 포함.
//     (d) used_in_script 전체 리셋·다른 세그먼트 재실행 없음(explanation_assets update 미호출).
//   scribe 부분 모드는 주입(스텁)해 실 callLLM 없이 DB 로직만 검증한다.
import { describe, it, expect } from "vitest";
import { regenerateSegment, type ScribeSegmentFn } from "../src/pipeline/segmentRegen.js";
import type { SegmentRegenDeps } from "../src/pipeline/segmentRegen.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { ScribeSegmentOutput } from "../src/agents/scribe/schema.js";

// ── fake supa ── 테이블별 select/update/delete/insert 체인을 캡처.
interface Captured {
  updateTable?: string;
  updatePatch?: Record<string, unknown>;
  updateEqs: [string, string][];
  deletes: { table: string; eqCol: string; eqVal: string }[];
  inserts: { table: string; rows: unknown[] }[];
  updatedTables: string[]; // update가 호출된 모든 테이블(used_in_script 리셋 감지용)
}

interface SeedRows {
  target: { id: string; ord: number; text: string; content_id: string };
  neighbors: { ord: number; text: string }[];
  factLinks: { fact_id: string }[];
  assetLinks: { asset_id: string }[];
  facts: { id: string; claim: string; verification_status: string; is_financial: boolean }[];
  assets: { id: string }[];
}

function makeSupa(seed: SeedRows) {
  const captured: Captured = { updateEqs: [], deletes: [], inserts: [], updatedTables: [] };

  function from(table: string) {
    return {
      select(_cols: string) {
        const eqs: [string, string][] = [];
        const chain: Record<string, unknown> = {
          eq(col: string, val: string) {
            eqs.push([col, val]);
            return chain;
          },
          in(_col: string, _vals: unknown[]) {
            // ord 이웃 / id 배치 조회
            if (table === "script_segments") return Promise.resolve({ data: seed.neighbors, error: null });
            if (table === "research_facts") return Promise.resolve({ data: seed.facts, error: null });
            if (table === "explanation_assets") return Promise.resolve({ data: seed.assets, error: null });
            return Promise.resolve({ data: [], error: null });
          },
          single: async () => {
            if (table === "script_segments") return { data: seed.target, error: null };
            return { data: null, error: { message: "no row" } };
          },
          // context.ts: getSelectedStagePayload/getToneProfile 은 order().limit().maybeSingle()
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          // lineage 조인 조회: script_segment_facts/_assets 는 .eq("segment_id").then
          then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
            let data: unknown[] = [];
            if (table === "script_segment_facts") data = seed.factLinks;
            else if (table === "script_segment_explanation_assets") data = seed.assetLinks;
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return chain;
      },
      update(patch: Record<string, unknown>) {
        captured.updatedTables.push(table);
        captured.updateTable = table;
        captured.updatePatch = patch;
        const chain: Record<string, unknown> = {
          eq(col: string, val: string) {
            captured.updateEqs.push([col, val]);
            return chain;
          },
          then(resolve: (v: { error: null }) => unknown) {
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return chain;
      },
      delete() {
        return {
          eq(col: string, val: string) {
            captured.deletes.push({ table, eqCol: col, eqVal: val });
            return Promise.resolve({ error: null });
          },
        };
      },
      insert(rows: unknown[]) {
        captured.inserts.push({ table, rows });
        return Promise.resolve({ error: null });
      },
    };
  }

  const supa = { from } as unknown as Supa;
  return { supa, captured };
}

function baseSeed(): SeedRows {
  return {
    target: { id: "seg2", ord: 1, text: "원래 본문", content_id: "c1" },
    neighbors: [
      { ord: 0, text: "앞 세그먼트" },
      { ord: 2, text: "뒤 세그먼트" },
    ],
    factLinks: [{ fact_id: "f1" }],
    assetLinks: [{ asset_id: "a1" }],
    facts: [{ id: "f1", claim: "주장1", verification_status: "verified", is_financial: true }],
    assets: [{ id: "a1" }],
  };
}

const deps = (supa: Supa): SegmentRegenDeps => ({
  supa,
  config: {} as SegmentRegenDeps["config"],
  costGuard: {} as SegmentRegenDeps["costGuard"],
});

describe("regenerateSegment — 단일 세그먼트 스코프", () => {
  it("(a) script_segments update가 run_id+id 스코프로만 호출된다", async () => {
    const { supa, captured } = makeSupa(baseSeed());
    const scribe: ScribeSegmentFn = async () => ({ text: "새 본문", used_fact_idxs: [0], used_asset_idxs: [0] });
    await regenerateSegment("run1", "seg2", "이유", deps(supa), scribe);

    expect(captured.updateTable).toBe("script_segments");
    expect(captured.updatePatch?.text).toBe("새 본문");
    expect(captured.updateEqs).toContainEqual(["run_id", "run1"]);
    expect(captured.updateEqs).toContainEqual(["id", "seg2"]);
    // script_segments 외의 update(예: explanation_assets used_in_script 전체 리셋)는 없음.
    expect(captured.updatedTables).toEqual(["script_segments"]);
  });

  it("(b) lineage는 그 세그먼트 것만 재설정 — delete/insert 모두 segment_id 스코프", async () => {
    const { supa, captured } = makeSupa(baseSeed());
    const scribe: ScribeSegmentFn = async () => ({ text: "새 본문", used_fact_idxs: [0], used_asset_idxs: [0] });
    await regenerateSegment("run1", "seg2", "이유", deps(supa), scribe);

    // delete 두 조인테이블 모두 segment_id=seg2 스코프
    const facDel = captured.deletes.find((d) => d.table === "script_segment_facts");
    const astDel = captured.deletes.find((d) => d.table === "script_segment_explanation_assets");
    expect(facDel).toEqual({ table: "script_segment_facts", eqCol: "segment_id", eqVal: "seg2" });
    expect(astDel).toEqual({ table: "script_segment_explanation_assets", eqCol: "segment_id", eqVal: "seg2" });

    // insert 도 그 세그먼트 것만
    const facIns = captured.inserts.find((i) => i.table === "script_segment_facts");
    const astIns = captured.inserts.find((i) => i.table === "script_segment_explanation_assets");
    expect(facIns?.rows).toEqual([{ segment_id: "seg2", fact_id: "f1" }]);
    expect(astIns?.rows).toEqual([{ segment_id: "seg2", asset_id: "a1" }]);
  });

  it("(c) 짠펜 부분 모드 입력에 reason + 이웃 맥락(neighbors) 포함", async () => {
    const { supa } = makeSupa(baseSeed());
    let seen: Parameters<ScribeSegmentFn>[0] | undefined;
    const scribe: ScribeSegmentFn = async (input) => {
      seen = input;
      return { text: "새 본문", used_fact_idxs: [], used_asset_idxs: [] };
    };
    await regenerateSegment("run1", "seg2", "톤 좀 부드럽게", deps(supa), scribe);

    expect(seen?.reason).toBe("톤 좀 부드럽게");
    expect(seen?.target).toBe("원래 본문");
    expect(seen?.neighbors).toEqual({ prev: "앞 세그먼트", next: "뒤 세그먼트" });
    // fact 입력에 caution 라벨(verified면 null)
    expect(seen?.facts).toEqual([
      { idx: 0, claim: "주장1", verification_status: "verified", is_financial: true, caution: null },
    ]);
  });

  it("(d) 범위 밖 fact/asset idx는 무시하고 dedup", async () => {
    const { supa, captured } = makeSupa(baseSeed());
    const scribe: ScribeSegmentFn = async () => ({
      text: "새 본문",
      used_fact_idxs: [0, 0, 9], // 중복 + 범위 밖
      used_asset_idxs: [5], // 범위 밖 → 링크 없음
    });
    await regenerateSegment("run1", "seg2", "이유", deps(supa), scribe);

    const facIns = captured.inserts.find((i) => i.table === "script_segment_facts");
    expect(facIns?.rows).toEqual([{ segment_id: "seg2", fact_id: "f1" }]); // dedup·범위밖 제거
    // asset은 전부 범위 밖 → insert 자체 없음
    expect(captured.inserts.find((i) => i.table === "script_segment_explanation_assets")).toBeUndefined();
  });

  it("미검증 fact는 caution 라벨(단정 금지)이 붙는다", async () => {
    const seed = baseSeed();
    seed.facts = [{ id: "f1", claim: "주장1", verification_status: "unverified", is_financial: false }];
    const { supa } = makeSupa(seed);
    let seen: Parameters<ScribeSegmentFn>[0] | undefined;
    const scribe: ScribeSegmentFn = async (input) => {
      seen = input;
      return { text: "x", used_fact_idxs: [], used_asset_idxs: [] };
    };
    await regenerateSegment("run1", "seg2", "이유", deps(supa), scribe);
    const seenFacts = seen!.facts as { caution: string | null }[];
    expect(seenFacts[0]!.caution).toBe("미검증 — 단정 금지, 일반 원리로만 설명");
  });
});

// ── 타입 컨트랙트: ScribeSegmentOutput 사용을 최소 검증 ──
describe("ScribeSegmentOutput 타입", () => {
  it("kind/payload 없이도 유효한 출력", () => {
    const out: ScribeSegmentOutput = { text: "t", used_fact_idxs: [], used_asset_idxs: [] };
    expect(out.text).toBe("t");
  });
});
