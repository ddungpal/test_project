// outline(섹션 배열) 순수 조작 헬퍼 — OutlineEditor가 이 결과를 onChange로 올린다.
//   전부 입력 배열 비변형(새 배열/객체 반환). 범위 밖 인덱스는 원본 그대로 반환(방어).
//   StructureSection 타입은 proposalTypes에서 재사용(중복 정의 금지).

import type { StructureSection } from "../dashboard/proposalTypes.js";

/** 빈 섹션 하나를 끝에 append(format 기본 explain). */
export function addSection(list: StructureSection[]): StructureSection[] {
  return [...list, { section: "", goal: "", why: "", format: "explain" }];
}

/** i번 섹션 제거. i가 범위 밖이면 원본을 복제해 반환(비변형). */
export function removeSection(list: StructureSection[], i: number): StructureSection[] {
  if (i < 0 || i >= list.length) return [...list];
  return list.filter((_, j) => j !== i);
}

/** from→to로 이동. from/to가 범위 밖이면 원본 복제 반환(비변형). */
export function moveSection(list: StructureSection[], from: number, to: number): StructureSection[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list];
  if (from === to) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1); // from 범위 검사 완료 → moved는 항상 존재
  next.splice(to, 0, moved as StructureSection);
  return next;
}

/** i번 섹션에 patch 병합. i가 범위 밖이면 원본 복제 반환(비변형). */
export function patchSection(
  list: StructureSection[],
  i: number,
  patch: Partial<StructureSection>,
): StructureSection[] {
  if (i < 0 || i >= list.length) return [...list];
  return list.map((s, j) => (j === i ? { ...s, ...patch } : s));
}
