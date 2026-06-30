// 비교(comparison) 자산 정규화 — 순수·결정적. DB·LLM·I/O 의존 없음(단위 테스트 가능).
//   comparator(또는 데모시드)가 준 비교 payload를 explanation_assets.payload 적재 가능한 형태로 정규화한다.
//   money-safety: 깨졌거나 알 수 없는 payload는 절대 throw하지 않고 null을 반환한다(=이 자산 드랍).
//     깨진 비교가 표로 박제되거나, 적재 파이프라인이 한 자산 때문에 통째로 죽지 않게.
//   stray 흡수: 명시 필드만 추려 반환하고 알 수 없는 추가 필드는 버린다(segmentBlock.ts 철학 미러).
//   ⚠ 이 모듈은 P3 comparison-table의 데이터 레일 — 생성(comparator)=step1, 짠펜 연결=step2, UI=step3.

export interface ComparisonCell {
  dimension: string; // 비교 차원(예: "가입조건")
  entity: string; // 비교 대상(예: "청년도약계좌")
  value: string; // 그 칸의 값
  verified: boolean; // 이 값이 검증된 fact에 근거하는가(false면 화면/대본에서 '확인 필요'로 표기)
}
export interface ComparisonPayload {
  entities: string[]; // 비교 대상 ≥2
  dimensions: string[]; // 비교 차원 ≥1
  cells: ComparisonCell[]; // entity×dimension 칸들
  caption?: string;
}

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string");
}

/**
 * comparator(또는 데모시드)가 준 비교 payload를 적재 가능한 형태로 정규화한다.
 * 구조가 깨졌으면 null을 반환한다(=이 자산 드랍 — 깨진 비교가 표로 박제되지 않게). throw 금지.
 */
export function normalizeComparison(payload: unknown): ComparisonPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // 비교 대상 ≥2, 차원 ≥1, cells 배열이 아니면 드랍(비교 대상 1개면 표가 아니다).
  if (!isNonEmptyStringArray(p.entities) || p.entities.length < 2) return null;
  if (!isNonEmptyStringArray(p.dimensions)) return null;
  if (!Array.isArray(p.cells)) return null;

  const entities = p.entities;
  const dimensions = p.dimensions;
  const entitySet = new Set(entities);
  const dimensionSet = new Set(dimensions);

  const cells: ComparisonCell[] = [];
  for (const c of p.cells) {
    if (typeof c !== "object" || c === null) continue;
    const cc = c as Record<string, unknown>;
    if (typeof cc.dimension !== "string" || typeof cc.entity !== "string" || typeof cc.value !== "string") continue;
    // 선언된 entities/dimensions에 없는 stray cell은 버린다.
    if (!entitySet.has(cc.entity) || !dimensionSet.has(cc.dimension)) continue;
    // verified는 boolean이 아니면 false 폴백(보수적 — 미검증 취급).
    cells.push({
      dimension: cc.dimension,
      entity: cc.entity,
      value: cc.value,
      verified: cc.verified === true,
    });
  }

  // 유효 cell이 0개면 빈 표 → 드랍.
  if (cells.length === 0) return null;

  const out: ComparisonPayload = { entities, dimensions, cells };
  if (typeof p.caption === "string") out.caption = p.caption;
  return out;
}
