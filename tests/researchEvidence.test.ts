// research/evidence 순수 헬퍼 단위 테스트 — DOM 무관(순수 함수).
//   핵심: ① 정상 계산, ② 경계·방어, ③ 입력 비변형(toStrictEqual 스냅샷 비교).
import { describe, it, expect } from "vitest";
import { pendingFactCount, unusedResearch } from "../src/lib/research/evidence.js";

describe("pendingFactCount", () => {
  it("pending===true 인 것만 센다", () => {
    expect(pendingFactCount([{ pending: true }, { pending: false }, { pending: true }])).toBe(2);
  });

  it("빈 배열은 0", () => {
    expect(pendingFactCount([])).toBe(0);
  });

  it("pending 필드 없는 원소는 세지 않는다(방어)", () => {
    expect(pendingFactCount([{}, {}, { pending: true }])).toBe(1);
    expect(pendingFactCount([{}, {}])).toBe(0);
  });

  it("pending 없는 원소와 false·true 혼재 시 true만(=== true 엄격)", () => {
    expect(pendingFactCount([{}, { pending: false }, { pending: true }])).toBe(1);
  });
});

describe("unusedResearch", () => {
  const rv = () => ({
    facts: [{ id: "f1" }, { id: "f2" }, { id: "f3" }],
    assets: [{ id: "a1" }, { id: "a2" }],
  });

  it("세그먼트에 쓰인 id는 제외, 안 쓰인 것만 반환", () => {
    const segs = [{ facts: [{ id: "f1" }], assets: [{ id: "a1" }] }];
    const { factIds, assetIds } = unusedResearch(rv(), segs);
    expect([...factIds].sort()).toEqual(["f2", "f3"]);
    expect([...assetIds]).toEqual(["a2"]);
  });

  it("같은 id가 여러 세그먼트에 있어도 union 정상(중복 세그먼트)", () => {
    const segs = [
      { facts: [{ id: "f1" }], assets: [{ id: "a1" }] },
      { facts: [{ id: "f1" }, { id: "f2" }], assets: [{ id: "a1" }] },
    ];
    const { factIds, assetIds } = unusedResearch(rv(), segs);
    expect([...factIds]).toEqual(["f3"]);
    expect([...assetIds]).toEqual(["a2"]);
  });

  it("경계: 세그먼트 없음 → rv 전부 unused", () => {
    const { factIds, assetIds } = unusedResearch(rv(), []);
    expect([...factIds].sort()).toEqual(["f1", "f2", "f3"]);
    expect([...assetIds].sort()).toEqual(["a1", "a2"]);
  });

  it("경계: 모든 rv id가 세그먼트에 쓰임 → 전부 used(빈 집합)", () => {
    const segs = [
      { facts: [{ id: "f1" }, { id: "f2" }, { id: "f3" }], assets: [{ id: "a1" }, { id: "a2" }] },
    ];
    const { factIds, assetIds } = unusedResearch(rv(), segs);
    expect(factIds.size).toBe(0);
    expect(assetIds.size).toBe(0);
  });

  it("세그먼트에만 있고 rv엔 없는 id는 결과에 안 나온다(rv 기준 차집합)", () => {
    const segs = [{ facts: [{ id: "ghost" }], assets: [{ id: "ghost-a" }] }];
    const { factIds, assetIds } = unusedResearch(rv(), segs);
    expect([...factIds].sort()).toEqual(["f1", "f2", "f3"]);
    expect([...assetIds].sort()).toEqual(["a1", "a2"]);
  });

  it("입력(rv·segments)을 변형하지 않는다", () => {
    const rvInput = rv();
    const rvSnapshot = rv();
    const segs = [{ facts: [{ id: "f1" }], assets: [{ id: "a1" }] }];
    const segsSnapshot = [{ facts: [{ id: "f1" }], assets: [{ id: "a1" }] }];

    unusedResearch(rvInput, segs);

    expect(rvInput).toStrictEqual(rvSnapshot);
    expect(segs).toStrictEqual(segsSnapshot);
  });
});
