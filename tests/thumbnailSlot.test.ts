// 썸네일 슬롯 재생성 — composeSlotReplacement 순수 합성(1칸만 교체·나머지 완전 보존)과
//   변주 system이 base와 promptHash/문자열로 달라짐(buildRegenerateAugmentedSystem 재사용)을 박는다.
//   DB·LLM 없이 순수 검증.
import { describe, it, expect } from "vitest";
import { composeSlotReplacement } from "../src/pipeline/thumbnailSlot.js";
import { buildRegenerateAugmentedSystem } from "../src/pipeline/regenerateVariation.js";
import { promptHash } from "../src/llm/promptHash.js";
import type { Candidate } from "../src/pipeline/stageContract.js";
import type { JsonSchema, ModelTier } from "../src/llm/types.js";

function cand(idx: number): Candidate {
  return { idx, payload: { thumbnail_main: [`메인${idx}A`, `메인${idx}B`] }, reason: `이유${idx}`, evidence_ids: [`ref:${idx}`] };
}

describe("composeSlotReplacement — 1칸만 교체·나머지 완전 보존", () => {
  const existing = [cand(0), cand(1), cand(2)];
  const newPayload = { thumbnail_main: ["새메인1", "새메인2"] };

  it("길이 3·idx 0,1,2 보존·idx1만 교체·c0/c2 완전 불변", () => {
    const out = composeSlotReplacement(existing, 1, newPayload, "새이유", ["ref:new"]);
    expect(out.length).toBe(3);
    expect(out.map((c) => c.idx)).toEqual([0, 1, 2]);

    // 교체된 칸(1)만 새 내용.
    expect(out[1]!.payload).toBe(newPayload);
    expect(out[1]!.reason).toBe("새이유");
    expect(out[1]!.evidence_ids).toEqual(["ref:new"]);

    // 나머지 두 칸은 완전 불변(payload·reason·evidence_ids 모두).
    expect(out[0]).toEqual(existing[0]);
    expect(out[2]).toEqual(existing[2]);
    expect(out[0]!.payload).toEqual({ thumbnail_main: ["메인0A", "메인0B"] });
    expect(out[2]!.reason).toBe("이유2");
    expect(out[2]!.evidence_ids).toEqual(["ref:2"]);
  });

  it("입력 배열을 변형하지 않는다(원본 불변)", () => {
    const snapshot = JSON.stringify(existing);
    composeSlotReplacement(existing, 0, newPayload, "x", []);
    expect(JSON.stringify(existing)).toBe(snapshot);
  });

  it("slotIdx 범위 밖(3) → throw", () => {
    expect(() => composeSlotReplacement(existing, 3, newPayload, "x", [])).toThrow();
  });

  it("slotIdx 범위 밖(-1) → throw", () => {
    expect(() => composeSlotReplacement(existing, -1, newPayload, "x", [])).toThrow();
  });
});

describe("슬롯 재생성 변주 — buildRegenerateAugmentedSystem 재사용으로 promptHash 차등", () => {
  const SCHEMA: JsonSchema = { type: "object" };
  const MODEL: ModelTier = "sonnet";
  const hashBase = { roleId: "thumbnail_maker", input: { topic: "절약" }, schema: SCHEMA, model: MODEL, maxTokens: 4096 };
  const base = "THUMB_SYSTEM_BASE";
  const priors = [cand(0), cand(1), cand(2)];

  it("변주 system은 base와 다른 문자열", () => {
    const aug = buildRegenerateAugmentedSystem(base, priors, 1);
    expect(aug).toContain(base);
    expect(aug).not.toBe(base);
  });

  it("변주 system은 base와 promptHash가 다르다(record/replay에서 새 결과)", () => {
    const aug = buildRegenerateAugmentedSystem(base, priors, 1);
    const hBase = promptHash({ ...hashBase, system: base });
    const hAug = promptHash({ ...hashBase, system: aug });
    expect(hAug).not.toBe(hBase);
  });
});
