// 썸네일 확정 게이트(confirmThumbnailSet) — 사람 게이트는 AI 0회·상태전환+기록만.
//   가드(state·proposal·후보3개)와 기록 형태(chosen_idx 센티넬 0·edited_payload=3개 payload 배열)를
//   가벼운 체이너블 fake supa로 검증. DB·LLM 없음.
import { describe, it, expect } from "vitest";
import { confirmThumbnailSet } from "../src/pipeline/gate.js";
import type { Supa } from "../src/pipeline/runState.js";

interface FakeOpts {
  runState: string;
  candidates: { payload: unknown }[] | null; // null = proposal 없음
}

// production_runs(getRun single·transitionRun update), stage_proposals(select chain maybeSingle),
//   stage_selections(insert single)만 흉내내는 최소 fake. 호출을 캡처해 단언.
function makeSupa(opts: FakeOpts) {
  const captured: { insertedSelection?: Record<string, unknown>; transition?: { to: string; from: string } } = {};
  let runState = opts.runState;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          // getRun: select(...).eq(...).single()
          select() {
            return {
              eq() {
                return {
                  single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }),
                };
              },
            };
          },
          // transitionRun: update({state,...}).eq(id).eq(state=from).select("id")
          update(patch: { state?: string }) {
            return {
              eq(_col: string, _val: string) {
                return {
                  eq(_col2: string, fromState: string) {
                    return {
                      select: async () => {
                        if (fromState !== runState) return { data: [], error: null }; // 낙관잠금 실패
                        captured.transition = { from: fromState, to: patch.state! };
                        runState = patch.state!;
                        return { data: [{ id: "run1" }], error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "stage_proposals") {
        // select("id, candidates").eq.eq.order.limit.maybeSingle()
        const result =
          opts.candidates == null
            ? { data: null, error: null }
            : { data: { id: "prop1", candidates: opts.candidates }, error: null };
        const chain = {
          eq() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () => result,
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        return {
          insert(row: Record<string, unknown>) {
            captured.insertedSelection = row;
            return { select: () => ({ single: async () => ({ data: { id: "sel1" }, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Supa;

  return { supa, captured };
}

const threeCands = [{ payload: { thumbnail_main: ["A"] } }, { payload: { thumbnail_main: ["B"] } }, { payload: { thumbnail_main: ["C"] } }];

describe("confirmThumbnailSet — 3개 세트 확정(사람 게이트·AI 0회)", () => {
  it("정상: thumbnails_proposed에서 3개 확정 → thumbnails_selected 전이·센티넬 기록", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_proposed", candidates: threeCands });
    const res = await confirmThumbnailSet(supa, "run1");

    expect(res.state).toBe("thumbnails_selected");
    expect(res.selectionId).toBe("sel1");
    // chosen_idx=0 센티넬, edited_payload=3개 payload 배열.
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.edited_payload).toEqual(threeCands.map((c) => c.payload));
    // selection_reason은 기록하지 않는다(생략).
    expect(captured.insertedSelection).not.toHaveProperty("selection_reason");
    expect(captured.transition).toEqual({ from: "thumbnails_proposed", to: "thumbnails_selected" });
  });

  it("state가 thumbnails_proposed가 아니면 throw(전이 안 함)", async () => {
    const { supa, captured } = makeSupa({ runState: "titles_selected", candidates: threeCands });
    await expect(confirmThumbnailSet(supa, "run1")).rejects.toThrow();
    expect(captured.transition).toBeUndefined();
    expect(captured.insertedSelection).toBeUndefined();
  });

  it("proposal이 없으면 throw", async () => {
    const { supa } = makeSupa({ runState: "thumbnails_proposed", candidates: null });
    await expect(confirmThumbnailSet(supa, "run1")).rejects.toThrow();
  });

  it("후보가 3개 미만이면 throw(세트 확정 불가)", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_proposed", candidates: threeCands.slice(0, 2) });
    await expect(confirmThumbnailSet(supa, "run1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });
});
