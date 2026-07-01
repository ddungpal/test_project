// outline/ops 순수 조작 헬퍼 단위 테스트 — DOM 무관(순수 함수).
//   핵심: ① 정상 동작, ② 경계·범위 밖 방어, ③ 입력 배열 비변형(toStrictEqual 스냅샷 비교).
import { describe, it, expect } from "vitest";
import { addSection, removeSection, moveSection, patchSection } from "../src/lib/outline/ops.js";
import type { StructureSection } from "../src/lib/dashboard/proposalTypes.js";

const sample = (): StructureSection[] => [
  { section: "도입", goal: "관심 끌기", why: "먼저 흥미", format: "explain" },
  { section: "비교", goal: "A vs B", why: "차이 이해", format: "table" },
  { section: "선택", goal: "누구는 A", why: "분기", format: "case" },
];

describe("addSection", () => {
  it("빈 섹션(format=explain)을 끝에 append한다", () => {
    const list = sample();
    const next = addSection(list);
    expect(next).toHaveLength(4);
    expect(next[3]).toStrictEqual({ section: "", goal: "", why: "", format: "explain" });
  });

  it("입력 배열을 변형하지 않는다", () => {
    const list = sample();
    const snapshot = sample();
    addSection(list);
    expect(list).toStrictEqual(snapshot);
    expect(addSection(list)).not.toBe(list);
  });

  it("빈 배열에도 동작한다", () => {
    expect(addSection([])).toStrictEqual([{ section: "", goal: "", why: "", format: "explain" }]);
  });
});

describe("removeSection", () => {
  it("i번 섹션을 제거한다", () => {
    const next = removeSection(sample(), 1);
    expect(next).toHaveLength(2);
    expect(next.map((s) => s.section)).toStrictEqual(["도입", "선택"]);
  });

  it("범위 밖 인덱스는 원본을 복제해 반환한다(비변형)", () => {
    const list = sample();
    expect(removeSection(list, -1)).toStrictEqual(sample());
    expect(removeSection(list, 99)).toStrictEqual(sample());
    expect(removeSection(list, 99)).not.toBe(list); // 새 배열
  });

  it("입력 배열을 변형하지 않는다", () => {
    const list = sample();
    const snapshot = sample();
    removeSection(list, 0);
    expect(list).toStrictEqual(snapshot);
  });
});

describe("moveSection", () => {
  it("from→to로 이동한다", () => {
    const next = moveSection(sample(), 0, 2);
    expect(next.map((s) => s.section)).toStrictEqual(["비교", "선택", "도입"]);
  });

  it("같은 위치면 순서 유지(내용 동일)", () => {
    const list = sample();
    expect(moveSection(list, 1, 1)).toStrictEqual(sample());
  });

  it("범위 밖 from/to는 원본 복제 반환(비변형)", () => {
    const list = sample();
    expect(moveSection(list, -1, 0)).toStrictEqual(sample());
    expect(moveSection(list, 0, 99)).toStrictEqual(sample());
    expect(moveSection(list, 5, 0)).not.toBe(list);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const list = sample();
    const snapshot = sample();
    moveSection(list, 0, 2);
    expect(list).toStrictEqual(snapshot);
  });
});

describe("patchSection", () => {
  it("해당 인덱스만 patch 병합한다", () => {
    const next = patchSection(sample(), 1, { section: "표 비교", format: "table" });
    expect(next[1]).toStrictEqual({ section: "표 비교", goal: "A vs B", why: "차이 이해", format: "table" });
    expect(next[0]).toStrictEqual(sample()[0]); // 다른 섹션 불변
    expect(next[2]).toStrictEqual(sample()[2]);
  });

  it("범위 밖 인덱스는 원본 복제 반환(비변형)", () => {
    const list = sample();
    expect(patchSection(list, -1, { section: "x" })).toStrictEqual(sample());
    expect(patchSection(list, 99, { section: "x" })).toStrictEqual(sample());
    expect(patchSection(list, 99, { section: "x" })).not.toBe(list);
  });

  it("입력 배열·원소를 변형하지 않는다", () => {
    const list = sample();
    const snapshot = sample();
    patchSection(list, 0, { goal: "바뀐 목표" });
    expect(list).toStrictEqual(snapshot);
  });
});
