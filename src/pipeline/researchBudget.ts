// 리서치 scope '기본 선택 개수' 헬퍼(순수) — 섹션 수에 비례한 기본 체크 힌트를 산출한다.
//   ★ 이건 '상한'이 아니라 'UI 기본 체크 개수' 제안일 뿐이다. 후보는 scope가 빠짐없이 전부 저장한다.
//   default_selected 마킹에만 쓰인다(researchScope.ts). 절대 후보 절단에 쓰지 마라.

/** outline payload({outline:[...]})의 섹션 개수. 못 읽으면 0. */
export function countOutlineSections(outline: unknown): number {
  if (!outline || typeof outline !== "object") return 0;
  const arr = (outline as { outline?: unknown }).outline;
  return Array.isArray(arr) ? arr.length : 0;
}

export interface ResearchBudgetConfig {
  claimsPerSection: number;
  conceptsPerSection: number;
  floor: number;
  ceiling: number;
}

/**
 * 섹션 수에 비례한 기본 선택 개수(claims·concepts) — floor/ceiling으로 클램프.
 *   sectionCount=0이면 floor로(섹션을 못 읽어도 최소 몇 개는 기본 체크).
 *   ★ 상한 아님 — 후보 전부 저장 후, 상위 N개만 default_selected=true로 표시하는 'N'을 정할 뿐.
 */
export function suggestDefaultSelection(
  sectionCount: number,
  cfg: ResearchBudgetConfig,
): { claims: number; concepts: number } {
  const sections = Number.isFinite(sectionCount) && sectionCount > 0 ? sectionCount : 0;
  const clamp = (n: number) => Math.max(cfg.floor, Math.min(cfg.ceiling, Math.round(n)));
  return {
    claims: clamp(sections * cfg.claimsPerSection),
    concepts: clamp(sections * cfg.conceptsPerSection),
  };
}
