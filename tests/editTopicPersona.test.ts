// 확정 후 주제 타겟 페르소나 손편집 — editSelectedTopic(gate) + getSelectedStagePayload(context) 라운드트립.
//   ★ 핵심 검증(불변식): target_persona만 교체되고 title·audience_level·audience_need는 그대로 보존된다
//     (persona 외 필드 덮어쓰기 = 다운스트림 제목·구성 깨짐). 액션(editTopicPersona)의 병합 로직을
//     순수 함수처럼 재현(현재 payload 읽기 → target_persona만 교체 → editSelectedTopic 저장)해서 검증한다.
//   ★ editSelectedTopic은 editSelectedTitle 미러(descriptor만 topic) — 확정(selection 존재) 후에만 동작,
//     상태 전이 없음. editSelected.test의 fake supa 패턴을 그대로 빌려 쓴다(새 fake 패턴 만들지 않음).
//   ★ 라운드트립: 저장 후 getSelectedStagePayload(supa,...,"topic")가 edited_payload(편집된 persona)를
//     우선 반환하는지 — 이게 구다리·짠펜 자동 전파의 근거다.
import { describe, it, expect } from "vitest";
import { editSelectedTopic } from "../src/pipeline/gate.js";
import { getSelectedStagePayload } from "../src/pipeline/context.js";
import type { Supa } from "../src/pipeline/runState.js";
import type { TopicPayload } from "../src/lib/dashboard/proposalTypes.js";

interface FakeOpts {
  confirmed: boolean; // true = 이 stage proposal 중 selection이 하나라도 존재(=확정됨)
  hasProposal: boolean; // false = 최신 proposal 없음(latestProposal에서 throw)
  prevChosenIdx?: number | null; // 기존 selection의 chosen_idx(없으면 selection row 자체가 없음)
  candidates?: { idx: number; payload: unknown }[]; // proposal.candidates(getSelectedStagePayload 원안 폴백용)
  editedPayload?: unknown | null; // 현재 selection의 edited_payload(있으면 우선 반환)
}

// editSelected.test의 fake를 빌려, getSelectedStagePayload가 쓰는 추가 컬럼/메서드만 보강한다:
//   stage_proposals: select("id, candidates").eq.eq.order.limit.maybeSingle → {id, candidates}.
//   stage_selections: select("chosen_idx, edited_payload").eq.order.limit.maybeSingle → {chosen_idx, edited_payload}.
//   기존 stageIsConfirmed/latestProposal/editSelectedTitle 경로는 그대로 동작.
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
          // getSelectedStagePayload·latestProposal: 최신 proposal(id + candidates).
          maybeSingle: async () =>
            latestId ? { data: { id: latestId, candidates }, error: null } : { data: null, error: null },
          // stageIsConfirmed: .eq().eq() 직후 await → 전체 proposal id 목록.
          then(resolve: (v: { data: { id: string }[]; error: null }) => unknown) {
            return Promise.resolve({ data: idRows, error: null }).then(resolve);
          },
        };
        return { select: () => chain };
      }
      if (table === "stage_selections") {
        return {
          select() {
            // editSelectedTitle 기존 chosen_idx: select("chosen_idx").eq.order.limit.maybeSingle.
            // getSelectedStagePayload: select("chosen_idx, edited_payload").eq.order.limit.maybeSingle.
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
              // stageIsConfirmed: select("id").in(ids).limit(1) → 배열(await/then).
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

// editTopicPersona 액션의 핵심 병합 로직(순수): 현재 payload에서 target_persona만 교체·나머지 보존.
//   액션은 requireOwner/createAdminClient에 묶여 supa 주입이 안 되므로, 그 사이 로직만 재현해 검증한다.
function mergePersona(current: TopicPayload, persona: string): TopicPayload {
  const next = persona.trim();
  if (!next) throw new Error("타겟은 비울 수 없습니다.");
  return { ...current, target_persona: next };
}

const baseTopic: TopicPayload = {
  title: "사회초년생 첫 월급 굴리기",
  audience_level: "beginner",
  audience_need: "목돈을 어디서부터 굴려야 할지 막막함",
};

describe("editTopicPersona 병합 불변식 — target_persona만 교체, 나머지 필드 보존", () => {
  it("persona 교체 시 title·audience_level·audience_need 보존", () => {
    const merged = mergePersona(baseTopic, "2030 사회초년생, 첫 월급 막막한 사람");
    expect(merged.target_persona).toBe("2030 사회초년생, 첫 월급 막막한 사람");
    expect(merged.title).toBe(baseTopic.title);
    expect(merged.audience_level).toBe(baseTopic.audience_level);
    expect(merged.audience_need).toBe(baseTopic.audience_need);
  });

  it("기존에 persona가 이미 있어도 새 값으로만 교체(다른 필드 불변)", () => {
    const withPersona: TopicPayload = { ...baseTopic, target_persona: "옛 타겟" };
    const merged = mergePersona(withPersona, "새 타겟");
    expect(merged.target_persona).toBe("새 타겟");
    expect(merged.title).toBe(baseTopic.title);
    expect(merged.audience_need).toBe(baseTopic.audience_need);
  });

  it("persona는 trim되어 저장(앞뒤 공백 제거)", () => {
    const merged = mergePersona(baseTopic, "  자녀계좌 만드는 부모  ");
    expect(merged.target_persona).toBe("자녀계좌 만드는 부모");
  });

  it("빈/공백 persona는 throw(저장 방지)", () => {
    expect(() => mergePersona(baseTopic, "")).toThrow();
    expect(() => mergePersona(baseTopic, "   ")).toThrow();
  });
});

describe("editSelectedTopic — 확정 후 주제 손편집(상태 전이 없음) + 라운드트립", () => {
  it("확정됨 → 새 selection INSERT(상태 불변), edited_payload=persona만 교체된 payload, chosen_idx 보존", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 2 });
    const payload = mergePersona(baseTopic, "2030 사회초년생");
    const res = await editSelectedTopic(supa, "run1", payload, "owner1");

    expect(res.selectionId).toBe("sel1");
    expect(captured.transition).toBeUndefined(); // ★ transitionRun 미호출(상태 전이 없음)
    expect(captured.insertedSelection?.proposal_id).toBe("prop1");
    expect(captured.insertedSelection?.chosen_idx).toBe(2); // 기존 chosen_idx 보존
    expect(captured.insertedSelection?.selected_by).toBe("owner1");
    // ★ 저장된 payload는 persona만 바뀌고 나머지 보존
    const saved = captured.insertedSelection?.edited_payload as TopicPayload;
    expect(saved.target_persona).toBe("2030 사회초년생");
    expect(saved.title).toBe(baseTopic.title);
    expect(saved.audience_level).toBe(baseTopic.audience_level);
    expect(saved.audience_need).toBe(baseTopic.audience_need);
  });

  it("기존 selection의 chosen_idx 조회가 비면 chosen_idx=0", async () => {
    const { supa, captured } = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: null });
    await editSelectedTopic(supa, "run1", mergePersona(baseTopic, "타겟"), "owner1");
    expect(captured.insertedSelection?.chosen_idx).toBe(0);
  });

  it("미확정(selection 전혀 없음)이면 throw·INSERT 안 됨(확정 후에만 동작)", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: true, prevChosenIdx: 0 });
    await expect(editSelectedTopic(supa, "run1", mergePersona(baseTopic, "타겟"), "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
    expect(captured.transition).toBeUndefined();
  });

  it("최신 proposal이 없으면 throw", async () => {
    const { supa, captured } = makeSupa({ confirmed: false, hasProposal: false });
    await expect(editSelectedTopic(supa, "run1", mergePersona(baseTopic, "타겟"), "owner1")).rejects.toThrow();
    expect(captured.insertedSelection).toBeUndefined();
  });

  it("라운드트립: 편집 후 getSelectedStagePayload('topic')이 edited_payload(편집된 persona)를 우선 반환", async () => {
    // 액션 흐름 재현: 현재 payload 읽기 → persona만 교체 → 저장 → 다시 읽기.
    //   현재 selection은 원안(idx=0, persona 없음), candidates에 원안 보유.
    const candidates = [{ idx: 0, payload: baseTopic }];
    const before = makeSupa({ confirmed: true, hasProposal: true, prevChosenIdx: 0, candidates });
    const current = (await getSelectedStagePayload(before.supa, "run1", "topic")) as TopicPayload;
    expect(current.target_persona).toBeUndefined(); // 편집 전엔 persona 없음(원안)

    const edited = mergePersona(current, "자녀계좌 공부하는 30·40대 부모");

    // 저장된 뒤 상태를 모사: edited_payload가 채워진 selection을 반환하는 supa로 재구성.
    const after = makeSupa({
      confirmed: true,
      hasProposal: true,
      prevChosenIdx: 0,
      candidates,
      editedPayload: edited,
    });
    const roundtrip = (await getSelectedStagePayload(after.supa, "run1", "topic")) as TopicPayload;
    expect(roundtrip.target_persona).toBe("자녀계좌 공부하는 30·40대 부모"); // 편집값 우선 반환
    expect(roundtrip.title).toBe(baseTopic.title); // 나머지 필드 그대로
    expect(roundtrip.audience_need).toBe(baseTopic.audience_need);
  });
});
