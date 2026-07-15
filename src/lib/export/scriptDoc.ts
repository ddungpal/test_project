// 대본 문서 export — 순수·결정적. DB·fetch·Date.now() 의존 0.
//   완성된 런의 제목·썸네일·더보기란/고정댓글·스크립트를 김짠부 구글 문서 구조와 동일한 .md 문자열로 조립한다.
//   섹션 순서·라벨·구분선은 학습 코퍼스 원본(corpus/raw/*.md) 포맷을 그대로 재현한다.
//   money-safety: 입력 배열이 비거나 짧아도 절대 throw하지 않는다(빈 섹션은 라벨만). 알 수 없는 kind는 조용히 prose 폴백.

import type { TablePayload, CasePayload, VisualPayload } from "../../pipeline/segmentBlock.js";

export interface ScriptDocInput {
  title: string;
  titleAlternates?: string[];
  // 썸네일 3안(각 안: main 보통 2개 상단/하단, boxes 보통 2개). 순서대로 [1안][2안][3안].
  thumbnails: { main: string[]; boxes: string[] }[];
  segments: { kind?: string; text: string; payload?: unknown }[]; // ord 순
}

// ── 코퍼스 포맷 상수 ──────────────────────────────────────────────────────
// 섹션 구분선: 원본 corpus/raw/*.md에서 그대로 복사한 값 — em-dash(U+2014) 1개 + 하이픈(U+002D) 99개 = 총 100자.
export const SECTION_DIVIDER =
  "—" + "-".repeat(99);

const LABEL_THUMBNAIL = "**썸네일**";
const LABEL_TITLE = "**제목**";
const LABEL_DESCRIPTION = "**더보기란/고정댓글**";
const LABEL_SCRIPT = "**🎬 스크립트**";

// 더보기란/고정댓글은 자동 생성하지 않는다(사용자 결정) — 빈 칸 안내 플레이스홀더 한 줄.
const DESCRIPTION_PLACEHOLDER = "(여기에 더보기란·고정댓글을 직접 작성하세요)";

// ── payload 좁히기(unknown → 구조) ────────────────────────────────────────
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function asTablePayload(payload: unknown): TablePayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!isStringArray(p.columns)) return null;
  if (!Array.isArray(p.rows) || !p.rows.every((r) => isStringArray(r))) return null;
  const out: TablePayload = { columns: p.columns, rows: p.rows as string[][] };
  if (typeof p.caption === "string") out.caption = p.caption;
  return out;
}

function asCasePayload(payload: unknown): CasePayload | null {
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
  return out;
}

function asVisualPayload(payload: unknown): VisualPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.cue !== "string" || p.cue.length === 0) return null;
  const out: VisualPayload = { cue: p.cue };
  if (typeof p.note === "string") out.note = p.note;
  if (
    p.cueType === "subtitle" ||
    p.cueType === "capture" ||
    p.cueType === "chart" ||
    p.cueType === "table"
  ) {
    out.cueType = p.cueType;
  }
  return out;
}

// ── 세그먼트 렌더 ─────────────────────────────────────────────────────────
// prose: text를 문단으로(문단 사이 빈 줄). 표현상 여러 줄이면 그대로 보존.
function renderProse(text: string): string {
  return text.trim();
}

// table: 마크다운 표. caption 있으면 표 위에 한 줄.
function renderTable(p: TablePayload): string {
  const lines: string[] = [];
  if (p.caption) lines.push(p.caption.trim());
  const header = `| ${p.columns.join(" | ")} |`;
  const sep = `| ${p.columns.map(() => "---").join(" | ")} |`;
  lines.push(header, sep);
  for (const row of p.rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

// case: intro(있으면) + 각 branch를 "- 만약 <condition> → <outcome>".
function renderCase(p: CasePayload): string {
  const lines: string[] = [];
  if (p.intro) lines.push(p.intro.trim());
  for (const b of p.branches) {
    lines.push(`- 만약 ${b.condition} → ${b.outcome}`);
  }
  return lines.join("\n");
}

// visual: "[화면: <cue>]" — cueType 있으면 종류별 배지.
const CUE_BADGE: Record<string, string> = {
  subtitle: "자막",
  capture: "화면캡처",
  chart: "그래프",
  table: "표",
};

function renderVisual(p: VisualPayload): string {
  const badge = p.cueType ? CUE_BADGE[p.cueType] ?? "화면" : "화면";
  return `[${badge}: ${p.cue.trim()}]`;
}

// 세그먼트 1개 → 문자열. 알 수 없는 kind·깨진 payload는 조용히 prose(text만)로 폴백(throw 금지).
function renderSegment(seg: { kind?: string; text: string; payload?: unknown }): string {
  switch (seg.kind) {
    case "table": {
      const p = asTablePayload(seg.payload);
      if (p) return renderTable(p);
      break;
    }
    case "case": {
      const p = asCasePayload(seg.payload);
      if (p) return renderCase(p);
      break;
    }
    case "visual": {
      const p = asVisualPayload(seg.payload);
      if (p) return renderVisual(p);
      break;
    }
    // 'prose'·undefined·미허용 kind는 아래 폴백.
    default:
      break;
  }
  return renderProse(seg.text);
}

// ── 섹션 조립 ─────────────────────────────────────────────────────────────
function thumbnailSection(input: ScriptDocInput): string {
  const lines: string[] = [LABEL_THUMBNAIL];
  // 3안을 [1안]/[2안]/[3안]으로 전부 렌더. 각 안: 메인 한 줄(/ 연결) + 작은 박스들.
  //   개수가 달라도 있는 만큼만(방어). 비면 라벨만.
  input.thumbnails.forEach((thumb, ti) => {
    lines.push(""); // 안 앞에 빈 줄(라벨과·안 사이 구분).
    lines.push(`[${ti + 1}안]`);
    // 메인은 상단/하단을 한 줄로 ' / ' 연결(2줄 아님).
    lines.push(`메인 : ${thumb.main.join(" / ")}`);
    thumb.boxes.forEach((box, i) => {
      lines.push(`작은 박스${i + 1} : ${box}`);
    });
  });
  return lines.join("\n");
}

function titleSection(input: ScriptDocInput): string {
  // 선택된 대표 제목과 후보를 라벨로 명확히 구분한다(그냥 '1.' 번호는 후보인지 알기 어렵다).
  const lines: string[] = [LABEL_TITLE, "", `선택 : ${input.title}`];
  const alts = input.titleAlternates ?? [];
  for (const alt of alts) {
    lines.push(`후보 : ${alt}`);
  }
  return lines.join("\n");
}

function descriptionSection(): string {
  return [LABEL_DESCRIPTION, "", DESCRIPTION_PLACEHOLDER].join("\n");
}

function scriptSection(input: ScriptDocInput): string {
  const body = input.segments.map(renderSegment).join("\n\n");
  if (body.length === 0) return LABEL_SCRIPT;
  return [LABEL_SCRIPT, "", body].join("\n");
}

/**
 * 완성된 런의 제목·썸네일·더보기란/고정댓글·스크립트를 김짠부 구글 문서 구조와 동일한 마크다운으로 조립한다.
 * 순수·결정적. 입력이 비거나 짧아도 throw하지 않고, 알 수 없는 세그먼트 kind는 조용히 prose로 폴백한다.
 */
export function buildScriptDocMarkdown(input: ScriptDocInput): string {
  const sections = [
    thumbnailSection(input),
    titleSection(input),
    descriptionSection(),
    scriptSection(input),
  ];
  // 섹션 사이에 구분선(빈 줄 감싸서).
  return sections.join(`\n\n${SECTION_DIVIDER}\n\n`) + "\n";
}
