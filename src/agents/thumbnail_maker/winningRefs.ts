// 우승 썸네일 few-shot 레퍼런스(thumbnail-winning-refs step0) — 성과순 top N 우승작을 뽑아
//   썸네일메이커 prompt 의 few-shot 으로 쓸 레퍼런스로 변환한다. 데이터/랭킹 계층만(prepare·UI는 step1).
//   ★ abLearnSource.ts 의 코드 조인 패턴 미러(ab_variants + perf d1·overall + contents).
//   ★ score 수식은 ctrWeightedScore 와 동일 부품(viewsConfidence)을 재사용해 드리프트를 차단한다.
//   ★ 핵심 안전망: 우승작 0건이면 반드시 [] (step1 이 length>0 일 때만 주입 → 빈 결과=promptHash 불변).

import type { Supa } from "../../pipeline/runState.js";
import { viewsConfidence } from "../../performance/abVerdict.js";
import { loadConfig } from "../../llm/config.js";

export interface WinningThumbnailRef {
  id: string; // "style:winner:<content_id>" — 후보가 따랐으면 evidence_ids 에 링크(날조 방지)
  topic: string; // 영상 라벨(contents.topic ?? title ?? id)
  main: string[]; // 우승 썸네일 메인문구(payload.copy_main)
  boxes: string[]; // 우승 썸네일 박스문구(payload.copy_boxes)
}

/** 순수 랭킹 입력(DB 무관). watchShare=ab_variants.ctr_pct 슬롯(점유율), ctr/views=perf d1 overall. */
export interface WinningRow {
  content_id: string;
  topic: string;
  main: string[];
  boxes: string[];
  watchShare: number | null; // ab_variants.ctr_pct(점유율 슬롯)
  ctr: number | null; // performance_metrics d1 overall CTR
  views: number | null; // performance_metrics d1 overall 조회수
}

/** payload(unknown)에서 string[] 슬롯 복원 — 배열 아니거나 항목이 비문자열/공백이면 제외(abLearnSource 좁힘 방식). */
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
}

/**
 * 성과순 top N. score = watchShare × ctr × viewsConfidence(views, viewsReference, floor).
 *   - null 인자는 ×1(우승작 누락 방지) — watchShare/ctr null 이면 그 인자만 1로, views null 이면 vconf=1.0.
 *   - 동률 tie-break = views 내림차순(결정성). main 빈 행은 제외.
 *   ★ 순수 함수 — DB·시각·env 접근 없음. floor·viewsReference 는 인자로만.
 */
export function rankWinningThumbnails(rows: WinningRow[], viewsReference: number | null, floor: number, limit: number): WinningThumbnailRef[] {
  const scored = rows
    .filter((r) => r.main.length > 0) // main 빈 행 제외(few-shot 가치 없음).
    .map((r) => {
      const ws = r.watchShare !== null && Number.isFinite(r.watchShare) ? r.watchShare : 1; // null/NaN → ×1.
      const ctr = r.ctr !== null && Number.isFinite(r.ctr) ? r.ctr : 1; // null/NaN → ×1.
      const vconf = viewsConfidence(r.views, viewsReference, floor); // views/reference 없으면 1.0(방어).
      return { row: r, score: ws * ctr * vconf };
    });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie-break: views 내림차순(결정성). null 은 최하위.
    const av = a.row.views !== null && Number.isFinite(a.row.views) ? a.row.views : -Infinity;
    const bv = b.row.views !== null && Number.isFinite(b.row.views) ? b.row.views : -Infinity;
    return bv - av;
  });

  return scored.slice(0, limit).map(({ row }) => ({
    id: `style:winner:${row.content_id}`,
    topic: row.topic,
    main: row.main,
    boxes: row.boxes,
  }));
}

interface WinnerVariantRow {
  content_id: string;
  payload: unknown;
  ctr_pct: number | null;
}

/**
 * ab_variants(thumbnail·is_winner) + perf(d1·overall) + contents 조인 → 성과순 top N.
 *   - 우승작 없으면 [](호출자가 필드 생략 → promptHash 불변). viewsReference=조인 행들의 views 최댓값.
 *   - floor=config.ab.viewsConfFloor. payload.copy_main/copy_boxes 로 카피 복원(string[] 아니면 빈 배열).
 */
export async function loadWinningThumbnailRefs(supa: Supa, limit = 8): Promise<WinningThumbnailRef[]> {
  // 1) 우승 썸네일 변형들.
  const { data: variants, error: ve } = await supa
    .from("ab_variants")
    .select("content_id, payload, ctr_pct")
    .eq("component_type", "thumbnail")
    .eq("is_winner", true);
  if (ve) throw new Error(`ab_variants(thumbnail winner) 조회 실패: ${ve.message}`);

  const rows = (variants ?? []) as WinnerVariantRow[];
  if (rows.length === 0) return []; // 우승작 0건 → 빈 배열(핵심 안전망: promptHash 불변).

  const contentIds = Array.from(new Set(rows.map((r) => r.content_id)));

  // contents(topic·title) — 영상 라벨용.
  const { data: contents, error: ce } = await supa.from("contents").select("id, title, topic").in("id", contentIds);
  if (ce) throw new Error(`contents 조회 실패: ${ce.message}`);
  const labelById = new Map<string, string>();
  for (const c of contents ?? []) labelById.set(c.id, c.topic ?? c.title ?? c.id);

  // performance_metrics d1 overall — 영상별 ctr·views.
  const { data: perf, error: pe } = await supa
    .from("performance_metrics")
    .select("content_id, ctr, views")
    .in("content_id", contentIds)
    .eq("metric_window", "d1")
    .eq("ab_variant", "overall");
  if (pe) throw new Error(`performance_metrics 조회 실패: ${pe.message}`);
  const ctrById = new Map<string, number | null>();
  const viewsById = new Map<string, number | null>();
  for (const r of perf ?? []) {
    ctrById.set(r.content_id, r.ctr);
    viewsById.set(r.content_id, r.views);
  }

  // WinningRow[] 구성.
  const winningRows: WinningRow[] = rows.map((r) => {
    const p = r.payload !== null && typeof r.payload === "object" && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : {};
    return {
      content_id: r.content_id,
      topic: labelById.get(r.content_id) ?? r.content_id,
      main: toStringArray(p.copy_main),
      boxes: toStringArray(p.copy_boxes),
      watchShare: r.ctr_pct,
      ctr: ctrById.get(r.content_id) ?? null,
      views: viewsById.get(r.content_id) ?? null,
    };
  });

  // viewsReference = 조인 행들의 views 최댓값(전부 null 이면 null — viewsConfidence 가 1.0 방어).
  const viewsVals = winningRows.map((r) => r.views).filter((v): v is number => v !== null && Number.isFinite(v));
  const viewsReference = viewsVals.length > 0 ? Math.max(...viewsVals) : null;

  const floor = loadConfig().ab.viewsConfFloor;
  return rankWinningThumbnails(winningRows, viewsReference, floor, limit);
}
