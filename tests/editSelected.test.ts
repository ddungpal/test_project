// 확정 후 손편집(editSelectedTitle/editSelectedThumbnails) — 상태 전이 없이 새 selection만 INSERT.
//   ★ 핵심 검증: transitionRun을 절대 호출하지 않는다(titles_selected/thumbnails_selected 자기전이는
//     DB 트리거가 거부 → 확정 상태에서만 동작, edited_payload=수정본). confirmThumbnails.test의 fake 패턴 재사용.
import { describe, it, expect } from "vitest";
import { editSelectedTitle, editSelectedThumbnails } from "../src/pipeline/gate.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { TitlePayload, ThumbnailPayload } from "../src/lib/dashboard/proposalTypes.js";

interface FakeOpts {
  runState: string;
  hasProposal: boolean; // false = 최신 proposal 없음
  prevChosenIdx?: number | null; // 기존 selection의 chosen_idx(없으면 selection row 자체가 없음)
}

// production_runs(getRun single·transitionRun update), stage_proposals(select chain maybeSingle),
//   stage_selections(insert single + select chain maybeSingle for 기존 chosen_idx)만 흉내. 호출 캡처.
function makeSupa(opts: FakeOpts) {
  const captured: {
    insertedSelection?: Record<string, unknown>;
    transition?: { from: string; to: string };
  } = {};
  let runState = opts.runState;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        return {
          select() {
            return {
              eq() {
                return { single: async () => ({ data: { id: "run1", state: runState, cost_usd: 0 }, error: null }) };
              },
            };
          },
          // transitionRun이 불리면 여기로 — 불리면 captured.transition이 세팅됨(테스트는 안 불리길 기대).
          update(patch: { state?: string }) {
            return {
              eq(_c: string, _v: string) {
                return {
                  eq(_c2: string, fromState: string) {
                    return {
                      select: async () => {
                        if (fromState !== runState) return { data: [], error: null };
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
        const result = opts.hasProposal ? { data: { id: "prop1" }, error: null } : { data: null, error: null };
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
          // editSelectedTitle: 기존 chosen_idx 조회 — select(...).eq.order.limit.maybeSingle()
          select() {
            const prev =
              opts.prevChosenIdx == null ? null : { chosen_idx: opts.prevChosenIdx };
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
              maybeSingle: async () => ({ data: prev, error: null }),
            };
            return chain;
          },
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

const titlePayload: TitlePayload = { title: "수정한 제목", thumbnail_layout: "split", thumbnail_main: ["A", "B"] };
const thumbPayloads: ThumbnailPayload[] = [
  { thumbnail_main: ["A"], thumbnail_boxes: ["a"] },
  { thumbnail_main: ["B"], thumbnail_boxes: ["b"] },
  { thumbnail_main: ["C"], thumbnail_boxes: ["c"] },
];

describe("editSelectedTitle — 확정 후 제목 손편집(상태 전이 없음)", () => {
  it("titles_selected에서 수정 → 새 selection INSERT, 상태 불변(전이 캡처 안 됨), edited_payload=수정본", async () => {
    const { supa, captured } = makeSupa({ runState: "titles_selected", hasProposal: true, prevChosenIdx: 2 });
    const res = await editSelectedTitle(supa, "run1", titlePayload, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.edited_payload).toEqual(titlePayload);
    expect(captured.insertedSelection?.chosen_idx).toBe(2); // 기존 chosen_idx 보존
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
  });

  it("기존 selection이 없으면 chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ runState: "titles_selected", hasProposal: true, prevChosenIdx: null });
    await editSelectedTitle(supa, "run1", titlePayload, "owner1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
  });

  it("확정 전(titles_proposed)이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ runState: "titles_proposed", hasProposal: true, prevChosenIdx: 0 });
    await expect(editSelectedTitle(supa, "run1", titlePayload, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("다른 상태(thumbnails_selected)면 throw", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_selected", hasProposal: true, prevChosenIdx: 0 });
    await expect(editSelectedTitle(supa, "run1", titlePayload, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    const { supa, captured } = makeSupa({ runState: "titles_selected", hasProposal: false });
    await expect(editSelectedTitle(supa, "run1", titlePayload, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });
});

describe("editSelectedThumbnails — 확정 후 썸네일 손편집(상태 전이 없음)", () => {
  it("thumbnails_selected에서 3개 수정 → 새 selection INSERT, 상태 불변, edited_payload=배열, chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_selected", hasProposal: true });
    const res = await editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0); // 센티넬
    expect(captured.insertedSelection?.edited_payload).toEqual(thumbPayloads);
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
  });

  it("payloads 길이 ≠ 3이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_selected", hasProposal: true });
    const four: ThumbnailPayload[] = [...thumbPayloads, { thumbnail_main: ["D"], thumbnail_boxes: ["d"] }];
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads.slice(0, 2), "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    await expect(editSelectedThumbnails(supa, "run1", four, "owner1")).rejects.toThrow();
  });

  it("확정 전(thumbnails_proposed)이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_proposed", hasProposal: true });
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    const { supa, captured } = makeSupa({ runState: "thumbnails_selected", hasProposal: false });
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });
});
