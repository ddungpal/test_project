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

// ── 짠펜 입력용 자산 게이트·빌드(순수·결정적) — scriptCell이 이 헬퍼를 쓴다(테스트 가능). ──
//   money-safety: 검증 안 된 자산은 대본에 안 넣는다.
//     숫자=math_verified, 비유=distortion_checked, 비교=normalizeComparison 유효(구조 깨진 비교 표 박제 금지).

// scriptCell이 explanation_assets에서 select하는 자산 행의 형태(게이트·입력 빌드에 필요한 필드만).
export interface AssetRowForScribe {
  concept: string;
  kind: string;
  numeric_example: string | null;
  analogy: string | null;
  math_verified: boolean | null;
  distortion_checked: boolean | null;
  payload?: unknown; // comparison 자산일 때만 채워짐(jsonb).
}

/**
 * money 게이트: 이 자산을 대본에 넣어도 되는지(검증 완료 여부) 판정한다.
 *   number→math_verified, analogy→distortion_checked, comparison→normalizeComparison 유효, 그 외→false.
 * 순수 predicate(부수효과 없음).
 */
export function isAssetUsable(a: AssetRowForScribe): boolean {
  return a.kind === "number"
    ? a.math_verified === true
    : a.kind === "analogy"
      ? a.distortion_checked === true
      : a.kind === "comparison"
        ? normalizeComparison(a.payload) !== null
        : false;
}

// 짠펜에 넘어가는 자산 입력 한 건의 형태.
//   number/analogy: 기존 그대로(payload 미포함) — promptHash 영향 최소화.
//   comparison: payload(정규화된 ComparisonPayload)를 함께 전달 — 짠펜이 entities/dimensions/cells로 표를 만든다.
export interface ScribeAssetInput {
  idx: number;
  concept: string;
  kind: string;
  numeric_example: string | null;
  analogy: string | null;
  payload?: ComparisonPayload;
}

/**
 * 게이트를 통과한 자산만 추려 짠펜 입력(assetsInput)으로 빌드한다(순수·결정적).
 *   - 반환 배열의 인덱스(idx)는 게이트 통과 순서 = scriptCell의 lineage 매핑(assets[ai]) 인덱스와 일치한다.
 *   - comparison만 payload를 포함(normalizeComparison 재호출 — 게이트와 일관, non-null 보장).
 *   - number/analogy-only 입력에선 기존과 동일한 모양(payload 키 없음)을 보장한다.
 */
export function buildAssetsInput(rows: AssetRowForScribe[]): ScribeAssetInput[] {
  return rows.filter(isAssetUsable).map((a, idx) => {
    const base: ScribeAssetInput = {
      idx,
      concept: a.concept,
      kind: a.kind,
      numeric_example: a.numeric_example,
      analogy: a.analogy,
    };
    if (a.kind === "comparison") {
      const payload = normalizeComparison(a.payload);
      if (payload) base.payload = payload; // 게이트 통과면 non-null 보장. 방어적 가드.
    }
    return base;
  });
}

/**
 * structure(getSelectedStagePayload 결과)에서 format==='table'인 outline 섹션만 추출한다(순수·결정적).
 * 비교가는 이 섹션들에 대해서만 비교 자산을 만든다(table 0개면 비교가 호출 자체를 안 함 → 기존 런 동작·비용 불변).
 * 방어적: structure/outline 형태가 깨졌어도 throw하지 않고 빈 배열(outline이 배열 아니면 [], 항목이 객체 아니면 skip).
 */
export function tableSectionsOf(structure: unknown): { section: string; goal: string }[] {
  if (typeof structure !== "object" || structure === null) return [];
  const outline = (structure as Record<string, unknown>).outline;
  if (!Array.isArray(outline)) return [];
  const out: { section: string; goal: string }[] = [];
  for (const s of outline) {
    if (typeof s !== "object" || s === null) continue;
    const sec = s as Record<string, unknown>;
    if (sec.format !== "table") continue;
    if (typeof sec.section !== "string") continue;
    out.push({ section: sec.section, goal: typeof sec.goal === "string" ? sec.goal : "" });
  }
  return out;
}
