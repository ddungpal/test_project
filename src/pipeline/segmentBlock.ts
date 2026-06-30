// 세그먼트 형식 블록 정규화 — 순수·결정적. DB·LLM·I/O 의존 없음(단위 테스트 가능).
//   짠펜(또는 데모시드)이 준 kind/payload를 DB(script_segments.kind/payload) 적재 가능한 형태로 정규화한다.
//   money-safety: 깨졌거나 알 수 없는 kind/payload는 절대 throw하지 않고 조용히 prose로 폴백한다
//     (적재 파이프라인이 한 세그먼트 때문에 통째로 죽거나, 깨진 형식이 화면에 박제되지 않게).
//   stray 흡수: 명시 필드만 추려 반환하고 알 수 없는 추가 필드는 버린다(style-extract-fold-stray 교훈).
//   ⚠ 짠펜은 이번 phase(P1)에서 여전히 prose만 emit — 이 모듈은 레일. P2에서 실제 블록 emit과 함께 활성.

export type SegmentKind = "prose" | "table" | "case" | "visual";

// 블록별 payload 형태(loose — 추후 확장 가능). P3~P5의 데이터 타깃.
export interface TablePayload {
  columns: string[];
  rows: string[][];
  caption?: string;
}
export interface CasePayload {
  intro?: string;
  branches: { condition: string; outcome: string }[];
}
export interface VisualPayload {
  cue: string;
  note?: string;
}

const PROSE: { kind: SegmentKind; payload: null } = { kind: "prose", payload: null };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

// table: { columns: string[], rows: string[][] } 만족 시만 통과. caption은 string일 때만 흡수.
function normalizeTable(payload: unknown): { kind: SegmentKind; payload: TablePayload } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!isStringArray(p.columns)) return null;
  if (!Array.isArray(p.rows) || !p.rows.every((r) => isStringArray(r))) return null;
  const out: TablePayload = { columns: p.columns, rows: p.rows as string[][] };
  if (typeof p.caption === "string") out.caption = p.caption;
  return { kind: "table", payload: out };
}

// case: branches가 {condition,outcome} 객체 배열(≥1)이 아니면 폴백. intro는 string일 때만 흡수.
function normalizeCase(payload: unknown): { kind: SegmentKind; payload: CasePayload } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.branches) || p.branches.length < 1) return null;
  const branches: { condition: string; outcome: string }[] = [];
  for (const b of p.branches) {
    if (typeof b !== "object" || b === null) return null;
    const bb = b as Record<string, unknown>;
    if (typeof bb.condition !== "string" || typeof bb.outcome !== "string") return null;
    branches.push({ condition: bb.condition, outcome: bb.outcome });
  }
  const out: CasePayload = { branches };
  if (typeof p.intro === "string") out.intro = p.intro;
  return { kind: "case", payload: out };
}

// visual: string cue 없으면 폴백. note는 string일 때만 흡수.
function normalizeVisual(payload: unknown): { kind: SegmentKind; payload: VisualPayload } | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.cue !== "string" || p.cue.length === 0) return null;
  const out: VisualPayload = { cue: p.cue };
  if (typeof p.note === "string") out.note = p.note;
  return { kind: "visual", payload: out };
}

/**
 * 짠펜(또는 데모시드)이 준 kind/payload를 DB 적재 가능한 형태로 정규화한다.
 * 깨졌거나 알 수 없는 kind/payload는 안전하게 prose로 폴백한다(throw 금지).
 */
export function normalizeSegmentPayload(
  kind: string | undefined | null,
  payload: unknown,
): { kind: SegmentKind; payload: TablePayload | CasePayload | VisualPayload | null } {
  switch (kind) {
    case "table":
      return normalizeTable(payload) ?? PROSE;
    case "case":
      return normalizeCase(payload) ?? PROSE;
    case "visual":
      return normalizeVisual(payload) ?? PROSE;
    // 'prose'·undefined·null·미허용 문자열은 전부 prose(payload 무시).
    default:
      return PROSE;
  }
}
