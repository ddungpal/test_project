// 확정 후 구성 손편집 — editSelectedStructure(gate) + getSelectedStagePayload(context) 라운드트립.
//   ★ editSelectedStructure는 editSelectedTitle 미러(descriptor만 structure) — 확정(selection 존재) 후에만 동작,
//     상태 전이 없음. editTopicPersona.test의 fake supa 패턴을 그대로 빌려 쓴다(새 fake 패턴 만들지 않음).
//   ★ 라운드트립: 저장 후 getSelectedStagePayload(supa,...,"structure")가 edited_payload(편집된 outline)를
//     우선 반환하는지 — 이게 짠펜·다운스트림 자동 전파의 근거다.
//   ★ regenerateAfterConfirm structure 경로: run/structure.requested를 postConfirm:true로 발행하는지
//     (액션은 requireOwner/createAdminClient에 묶여 supa 주입이 안 되므로, 이벤트 페이로드 구성 로직만 순수 재현).
import { describe, it, expect } from "vitest";
import { editSelectedStructure } from "../src/pipeline/gate.js";
import { getSelectedStagePayload } from "../src/pipeline/context.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { StructurePayload } from "../src/lib/dashboard/proposalTypes.js";

interface FakeOpts {
  confirmed: boolean; // true = 이 stage proposal 중 selection이 하나라도 존재(=확정됨)
  hasProposal: boolean; // false = 최신 proposal 없음(latestProposal에서 throw)
  prevChosenIdx?: number | null; // 기존 selection의 chosen_idx(없으면 selection row 자체가 없음)
  candidates?: { idx: number; payload: unknown }[]; // proposal.candidates(getSelectedStagePayload 원안 폴백용)
  editedPayload?: unknown | null; // 현재 selection의 edited_payload(있으면 우선 반환)
}

// editTopicPersona.test의 fake를 그대로 빌린다: getSelectedStagePayload가 쓰는 추가 컬럼/메서드까지 보강.
//   stage_proposals: select("id, candidates").eq.eq.order.limit.maybeSingle → {id, candidates}.
//   stage_selections: select("chosen_idx, edited_payload").eq.order.limit.maybeSingle → {chosen_idx, edited_payload}.
//   기존 stageIsConfirmed/latestProposal/editSelectedStructure 경로는 그대로 동작.
function makeSupa(opts: FakeOpts) {
  const captured: {
    insertedSelection?: Record<string, unknown>;
    transition?: { from: string; to: string };
  } = {};

  const proposalIds = opts.hasProposal ? ["prop1"] : [];
  const latestId = proposalIds.length > 0 ? proposalIds[proposalIds.length - 1] : null;
  const candidates = opts.candidates ?? [];

  const supa = {
    from(table: string) {
      if (table === "production_runs") {
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
          maybeSingle: async () =>
            latestId ? { data: { id: latestId, candidates }, error: null } : { data: null, error: null },
          then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
            return Promise.resolve({ data: idRows, error: null }).then(resolve);
          },
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        return {
          select() {
            const sel =
              opts.prevChosenIdx == null
                ? null
                : { chosen_idx: opts.prevChosenIdx, edited_payload: opts.editedPayload ?? null };
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
              maybeSingle: async () => ({ data: sel, error: null }),
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

const baseStructure: StructurePayload = {
  approach: "돈 흐름을 시간순으로 따라가는 스토리텔링",
  outline: [
    { section: "첫 월급의 함정", goal: "공감 후킹", why: "시청자 상황을 먼저 비춘다", format: "explain" },
    { section: "통장 쪼개기", goal: "실행법 제시", why: "가장 쉬운 첫 행동", format: "table" },
  ],
};

describe("editSelectedStructure — 확정 후 구성 손편집(상태 전이 없음) + 라운드트립", () => {
  it("확정됨 → 새 selection INSERT(상태 불변), edited_payload=수정 구성, chosen_idx 보존", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 1 });
    const edited: StructurePayload = {
      ...baseStructure,
      outline: [...baseStructure.outline, { section: "실전 예시", goal: "구체화", why: "마무리 각인", format: "case" }],
    };
    const res = await editSelectedStructure(supa, "run1", edited, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출(상태 전이 없음)
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.chosen_idx).toBe(1); // 기존 chosen_idx 보존
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
    const saved = captured.insertedSelection?.edited_payload as StructurePayload;
    expect(saved.approach).toBe(edited.approach);
    expect(saved.outline).toHaveLength(3); // 섹션 추가 반영
  });

  it("기존 selection의 chosen_idx 조회가 비면 chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: null });
    await editSelectedStructure(supa, "run1", baseStructure, "owner1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
  });

  it("미확정(selection 전혀 없음)이면 throw·INSERT 안 됨(확정 후에만 동작)", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: true, prevChosenIdx: 0 });
    await expect(editSelectedStructure(supa, "run1", baseStructure, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: false });
    await expect(editSelectedStructure(supa, "run1", baseStructure, "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });

  it("라운드트립: 편집 후 getSelectedStagePayload('structure')가 edited_payload(편집 outline)를 우선 반환", async () => {
    const candidates = [{ idx: 0, payload: baseStructure }];
    // 편집 전: 현재 선택은 원안(idx=0, edited_payload 없음)
    const before = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 0, candidates });
    const current = (await getSelectedStagePayload(before.supa, "run1", "structure")) as StructurePayload;
    expect(current.outline).toHaveLength(2); // 원안

    const edited: StructurePayload = {
      approach: "질문형 도입 후 단계별 실행",
      outline: [
        ...baseStructure.outline,
        { section: "자동이체 세팅", goal: "습관화", why: "지속 가능성", format: "explain" },
      ],
    };

    // 저장된 뒤 상태 모사: edited_payload가 채워진 selection을 반환하는 supa로 재구성.
    const after = makeSupa({
      confirmed: true,
      hasProposal: true,
      prevChosenIdx: 0,
      candidates,
      editedPayload: edited,
    });
    const roundtrip = (await getSelectedStagePayload(after.supa, "run1", "structure")) as StructurePayload;
    expect(roundtrip.approach).toBe("질문형 도입 후 단계별 실행"); // 편집값 우선 반환
    expect(roundtrip.outline).toHaveLength(3); // 편집된 outline 그대로
  });
});

// regenerateAfterConfirm의 이벤트 페이로드 구성(순수) — 액션은 requireOwner/createAdminClient에 묶여
//   supa/inngest 주입이 안 되므로, 액션이 inngest.send에 넘기는 { name, data } 구성 로직만 그대로 재현해 검증한다.
//   (editTopicPersona.test가 mergePersona 병합 로직만 순수 재현한 것과 동일한 방식.)
function buildRegenEvent(
  runId: string,
  component: "titles" | "thumbnail" | "structure",
  reason?: string,
): { name: string; data: Record<string, unknown> } {
  const name = (
    { titles: "run/titles.requested", thumbnail: "run/thumbnails.requested", structure: "run/structure.requested" } as const
  )[component];
  return { name, data: { runId, postConfirm: true, ...(reason && reason.trim() ? { reason } : {}) } };
}

describe("regenerateAfterConfirm — structure 경로", () => {
  it("component='structure'면 run/structure.requested를 postConfirm:true로 발행", () => {
    const ev = buildRegenEvent("run1", "structure");
    expect(ev.name).toBe("run/structure.requested");
    expect(ev.data.postConfirm).toBe(true);
    expect(ev.data.runId).toBe("run1");
    expect("reason" in ev.data).toBe(false); // reason 없으면 미포함(exactOptionalPropertyTypes)
  });

  it("reason이 있으면 페이로드에 포함", () => {
    const ev = buildRegenEvent("run1", "structure", "흐름을 질문형으로 바꾸고 싶어");
    expect(ev.data.reason).toBe("흐름을 질문형으로 바꾸고 싶어");
    expect(ev.data.postConfirm).toBe(true);
  });

  it("공백 reason은 미포함", () => {
    const ev = buildRegenEvent("run1", "structure", "   ");
    expect("reason" in ev.data).toBe(false);
  });

  it("기존 component(titles/thumbnail)는 회귀 없이 각 이벤트로", () => {
    expect(buildRegenEvent("r", "titles").name).toBe("run/titles.requested");
    expect(buildRegenEvent("r", "thumbnail").name).toBe("run/thumbnails.requested");
  });
});
