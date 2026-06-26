// 확정 후 손편집(editSelectedTitle/editSelectedThumbnails) — 상태 전이 없이 새 selection만 INSERT.
//   ★ 핵심 검증: transitionRun을 절대 호출하지 않는다(titles_selected/thumbnails_selected 자기전이는
//     DB 트리거가 거부 → 확정 상태에서만 동작, edited_payload=수정본). confirmThumbnails.test의 fake 패턴 재사용.
//   ★ 확정 판정은 더 이상 run.state 정확일치가 아니라 'stage_proposals 횡단 selection 존재'다
//     (relax-edit-state-guard) — 확정 후 다운스트림으로 state가 바뀌어도 손편집 허용. fake는 그 새 쿼리
//     형태(전체 proposal id select + .in(...).limit(1))를 흉내내고, confirmed 플래그로 selection 존재를 모사한다.
import { describe, it, expect } from "vitest";
import { editSelectedTitle, editSelectedThumbnails } from "../src/pipeline/gate.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { TitlePayload, ThumbnailPayload } from "../src/lib/dashboard/proposalTypes.js";

interface FakeOpts {
  confirmed: boolean; // true = 이 stage proposal 중 selection이 하나라도 존재(=확정됨)
  hasProposal: boolean; // false = 최신 proposal 없음(latestProposal에서 throw)
  prevChosenIdx?: number | null; // 기존 selection의 chosen_idx(없으면 selection row 자체가 없음)
  proposalIds?: string[]; // 이 run·stage의 모든 proposal id(stageIsConfirmed 횡단 select). 기본 ["prop1"].
}

// stage_proposals: stageIsConfirmed는 select("id").eq.eq → 배열(thenable), latestProposal은 .order.limit.maybeSingle.
// stage_selections: stageIsConfirmed는 select("id").in(...).limit(1) → 배열(thenable),
//   editSelectedTitle 기존 chosen_idx는 select("chosen_idx").eq.order.limit.maybeSingle. insert는 single. 호출 캡처.
function makeSupa(opts: FakeOpts) {
  const captured: {
    insertedSelection?: Record<string, unknown>;
    transition?: { from: string; to: string };
  } = {};

  const proposalIds = opts.proposalIds ?? (opts.hasProposal ? ["prop1"] : []);
  // 최신 proposal id = 목록의 마지막(가장 최근에 생성됐다고 본다). 없으면 null.
  const latestId = proposalIds.length > 0 ? proposalIds[proposalIds.length - 1] : null;

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
        // transitionRun이 불리면 여기로(테스트는 안 불리길 기대). getRun은 손편집 경로에서 더 이상 안 쓰임.
        return {
          update(patch: { state?: string }) {
            return {
              eq(_c: string, _v: string) {
                return {
                  eq(_c2: string, fromState: string) {
                    return {
                      select: async () => {
                        captured.transition = { from: fromState, to: patch.state! };
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
        // stageIsConfirmed: select("id").eq("run_id").eq("stage") → 배열(await). then으로 thenable.
        // latestProposal: select("id").eq.eq.order.limit.maybeSingle → 최신 1개.
        const idRows = proposalIds.map((id) => ({ id }));
        const chain: Record<string, unknown> = {
          eq() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          maybeSingle: async () => (latestId ? { data: { id: latestId }, error: null } : { data: null, error: null }),
          // .eq().eq() 직후 await → stageIsConfirmed가 전체 목록을 받는다.
          then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
            return Promise.resolve({ data: idRows, error: null }).then(resolve);
          },
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        return {
          // stageIsConfirmed: select("id").in(ids).limit(1) → 배열(await/then).
          // editSelectedTitle 기존 chosen_idx: select("chosen_idx").eq.order.limit.maybeSingle.
          select() {
            const prev = opts.prevChosenIdx == null ? null : { chosen_idx: opts.prevChosenIdx };
            const selRows = opts.confirmed ? [{ id: "selX" }] : [];
            const chain: Record<string, unknown> = {
              in() {
                return chain;
              },
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
              then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
                return Promise.resolve({ data: selRows, error: null }).then(resolve);
              },
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
  it("확정됨(selection 존재) → 새 selection INSERT, 상태 불변(전이 캡처 안 됨), edited_payload=수정본", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 2 });
    const res = await editSelectedTitle(supa, "run1", titlePayload, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.edited_payload).toEqual(titlePayload);
    expect(captured.insertedSelection?.chosen_idx).toBe(2); // 기존 chosen_idx 보존
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
  });

  it("기존 selection의 chosen_idx 조회가 비면 chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: null });
    await editSelectedTitle(supa, "run1", titlePayload, "owner1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
  });

  it("확정 전(selection 전혀 없음)이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: true, prevChosenIdx: 0 });
    await expect(editSelectedTitle(supa, "run1", titlePayload, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("확정 후 run.state가 다운스트림(예 thumbnails_selected)이어도 성공 — selection 존재로 판정", async () => {
    // run.state는 이제 판정에 안 쓰임: confirmed=true면 다운스트림이든 편집 허용, transition 미호출.
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 1 });
    const res = await editSelectedTitle(supa, "run1", titlePayload, "owner1");
    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined();
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
  });

  it("재생성: 확정 selection이 이전 proposal에 있고 더 새 proposal이 있어도 편집 허용 + 새 selection은 latest proposal에 INSERT", async () => {
    // proposalIds=[prop_old, prop_new]: 확정 selection은 prop_old에 있고(횡단으로 confirmed=true),
    //   latestProposal은 prop_new를 고른다 → 새 selection은 prop_new에 INSERT.
    const { supa, captured } = makeSupa({
      confirmed: true,
      hasProposal: true,
      prevChosenIdx: 0,
      proposalIds: ["prop_old", "prop_new"],
    });
    const res = await editSelectedTitle(supa, "run1", titlePayload, "owner1");
    expect(res.selectionId).toBe("sel1");
    expect(captured.insertedSelection?.proposal_id).toBe("prop_new");
    expect(captured.transition).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    // proposal이 전혀 없으면 stageIsConfirmed가 먼저 false → 확정 전으로 throw.
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: false });
    await expect(editSelectedTitle(supa, "run1", titlePayload, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });
});

describe("editSelectedThumbnails — 확정 후 썸네일 손편집(상태 전이 없음)", () => {
  it("확정됨에서 3개 수정 → 새 selection INSERT, 상태 불변, edited_payload=배열, chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true });
    const res = await editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0); // 센티넬
    expect(captured.insertedSelection?.edited_payload).toEqual(thumbPayloads);
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
  });

  it("payloads 길이 ≠ 3이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true });
    const four: ThumbnailPayload[] = [...thumbPayloads, { thumbnail_main: ["D"], thumbnail_boxes: ["d"] }];
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads.slice(0, 2), "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    await expect(editSelectedThumbnails(supa, "run1", four, "owner1")).rejects.toThrow();
  });

  it("확정 전(selection 전혀 없음)이면 throw·INSERT 안 됨", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: true });
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("확정 후 run.state가 다운스트림(예 structure_proposed)이어도 성공 — selection 존재로 판정", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true });
    const res = await editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1");
    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined();
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
  });

  it("재생성: 확정 selection이 이전 proposal에 있고 더 새 proposal이 있어도 편집 허용 + 새 selection은 latest proposal에 INSERT", async () => {
    const { supa, captured } = makeSupa({
      confirmed: true,
      hasProposal: true,
      proposalIds: ["prop_old", "prop_new"],
    });
    const res = await editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1");
    expect(res.selectionId).toBe("sel1");
    expect(captured.insertedSelection?.proposal_id).toBe("prop_new");
    expect(captured.transition).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: false });
    await expect(editSelectedThumbnails(supa, "run1", thumbPayloads, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });
});
