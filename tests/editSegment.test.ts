// 짠펜 세그먼트 프로즈 직접 수정 — editSegmentText(gate) 검증. editStructure.test의 fake supa 관행을 따르되,
//   세그먼트는 edited_payload가 아니라 script_segments 행 직접 update라 kind select → update 체인을 모사한다.
//   ★ 핵심 불변식(3가지):
//     (a) 프로즈(kind=prose/null)면 update가 run_id+id 두 스코프로 호출된다(타 run 오염 금지).
//     (b) 블록(table/case/visual)이면 throw·update 미호출(프로즈만 직접 수정).
//     (c) 빈/공백 text면 throw(kind 조회조차 안 감).
//   editSegment 액션은 requireOwner/createAdminClient에 묶여 supa 주입이 안 되므로, DB 로직만 담은
//   순수 게이트(editSegmentText)를 fake supa로 직접 검증한다(editSelectedStructure를 gate에서 검증한 것과 동일).
import { describe, it, expect } from "vitest";
import { editSegmentText } from "../src/pipeline/gate.js";
import type { Supa } from "../src/pipeline/runState.js";

interface FakeOpts {
  kind: string | null; // 조회될 세그먼트 kind(prose/null=허용, table/case/visual=거부)
  selectError?: string; // kind 조회 에러(있으면 single이 error 반환)
}

function makeSupa(opts: FakeOpts) {
  const captured: {
    selectEqs: [string, string][]; // kind 조회 .eq 인자들
    updated?: Record<string, unknown>; // update()에 넘긴 patch
    updateEqs: [string, string][]; // update 후 .eq 인자들(스코프)
  } = { selectEqs: [], updateEqs: [] };

  const supa = {
    from(table: string) {
      if (table !== "script_segments") throw new Error(`unexpected table: ${table}`);
      return {
        // kind 조회: select("kind").eq("run_id",..).eq("id",..).single()
        select(_cols: string) {
          const chain: Record<string, unknown> = {
            eq(col: string, val: string) {
              captured.selectEqs.push([col, val]);
              return chain;
            },
            single: async () =>
              opts.selectError
                ? { data: null, error: { message: opts.selectError } }
                : { data: { kind: opts.kind }, error: null },
          };
          return chain;
        },
        // 텍스트 update: update({text}).eq("run_id",..).eq("id",..)
        update(patch: Record<string, unknown>) {
          captured.updated = patch;
          const chain: Record<string, unknown> = {
            eq(col: string, val: string) {
              captured.updateEqs.push([col, val]);
              return chain;
            },
            // 마지막 .eq await → 결과 반환(then으로 thenable).
            then(resolve: (v: { error: null }) => unknown) {
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  } as unknown as Supa;

  return { supa, captured };
}

describe("editSegmentText — 프로즈 세그먼트 직접 수정(상태 전이 0·AI 0)", () => {
  it("(a) 프로즈면 update가 run_id+id 스코프로 호출·trim된 text 저장", async () => {
    const { supa, captured } = makeSupa({ kind: "prose" });
    await editSegmentText(supa, "run1", "seg1", "  새 프로즈 본문  ");

    // kind 조회도 run_id+id 스코프
    expect(captured.selectEqs).toContainEqual(["run_id", "run1"]);
    expect(captured.selectEqs).toContainEqual(["id", "seg1"]);
    // update 스코프 — run_id·id 둘 다 필수(타 run 오염 금지)
    expect(captured.updateEqs).toContainEqual(["run_id", "run1"]);
    expect(captured.updateEqs).toContainEqual(["id", "seg1"]);
    // trim된 text 저장
    expect(captured.updated?.text).toBe("새 프로즈 본문");
    // text 외 필드 update 없음(상태·kind 등 불변)
    expect(Object.keys(captured.updated ?? {})).toEqual(["text"]);
  });

  it("(a') kind=null(구데이터)도 프로즈 취급 → update 수행", async () => {
    const { supa, captured } = makeSupa({ kind: null });
    await editSegmentText(supa, "run1", "seg1", "본문");
    expect(captured.updated?.text).toBe("본문");
    expect(captured.updateEqs).toContainEqual(["run_id", "run1"]);
  });

  it("(b) 블록(table/case/visual)이면 throw·update 미호출", async () => {
    for (const kind of ["table", "case", "visual"]) {
      const { supa, captured } = makeSupa({ kind });
      await expect(editSegmentText(supa, "run1", "seg1", "본문")).rejects.toThrow();
      expect(captured.updated).toBeUndefined(); // update 안 감
    }
  });

  it("(c) 빈/공백 text면 throw·조회·update 둘 다 미호출", async () => {
    for (const text of ["", "   ", "\n\t"]) {
      const { supa, captured } = makeSupa({ kind: "prose" });
      await expect(editSegmentText(supa, "run1", "seg1", text)).rejects.toThrow();
      expect(captured.selectEqs).toHaveLength(0); // 가드가 먼저 — kind 조회조차 안 감
      expect(captured.updated).toBeUndefined();
    }
  });

  it("kind 조회 실패면 throw·update 미호출", async () => {
    const { supa, captured } = makeSupa({ kind: "prose", selectError: "no such row" });
    await expect(editSegmentText(supa, "run1", "seg1", "본문")).rejects.toThrow();
    expect(captured.updated).toBeUndefined();
  });
});
