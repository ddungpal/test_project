// A/B 학습 입력을 DB에서 구성(copy-learning-admin step1) — 앱 내 재학습(styleRelearnSweep)이
//   JSON(loadAbResults) 대신 관리자 입력이 반영된 DB를 읽게 한다. "관리자 입력 → 재학습" 루프의 입력단.
//   ★ 출력은 learn-ab-style 의 AbResultVideo[] 형태(기존 학습 본체 재사용·드리프트 차단).
//   ★ CTR·조회수는 performance_metrics(overall)에서 영상별 1건 — d7(업로드 1주일 성과) 우선·없으면 d1 폴백 —
//     ctrWeightedScore 의 video_ctr24h/video_views24h 로 주입된다. (CTR 은 노출클릭률·수동입력, views 는 자동수집.)
//
//   세 경로:
//     1) thumbnail / title-A/B: ab_variants(해당 component) + 영상 CTR → 영상 내 A/B 비교(mode 미지정=ab).
//        watch_share_pct(=ctr_pct 슬롯) 로 영상 내 승패를 재계산(judgeComponent 권위)하므로 그대로 옮긴다.
//     2) title-단일(영상당 variant 1개): 영상 내 비교 불가 → 영상간 CTR 순위로 winner/loser 합성(learn_mode="single").
//        상위 영상 = 양의 예시(고CTR), 하위 영상 = loser. CTR 크기 자체가 가중(ctrWeightedScore single).

import type { Supa } from "../pipeline/runState.js";
import type { AbComponent, AbVariantKey } from "./types.js";
import type { AbResultVideo, AbResultVariant } from "../../scripts/learn-ab-style.js";

/** ab_variants.component_type 값(DB). 'title' 그대로, thumbnail 은 'thumbnail'. */
function dbComponent(component: AbComponent): "title" | "thumbnail" {
  return component === "title" ? "title" : "thumbnail";
}

/** payload(Json)에서 카피 텍스트 복원. 썸네일=copy_top/main/box, 제목=title → copy_main 슬롯. */
//   ★ correctionLearnSource 도 재사용(교정 payload 는 ab_variants 와 동일 모양 — 드리프트 0). 재구현 금지.
export function payloadToVariantFields(payload: unknown, component: AbComponent): Pick<AbResultVariant, "copy_top" | "copy_main" | "copy_box" | "copy_sub" | "visual"> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  if (component === "title") {
    // 제목 텍스트는 payload.title(없으면 copy_main) → copy_main 슬롯(joinCopy 가 합쳐 한 문자열로).
    const title = str(p.title) ?? str(p.copy_main);
    const out: Pick<AbResultVariant, "copy_main"> = {};
    if (title !== undefined) out.copy_main = title;
    return out;
  }

  const out: Pick<AbResultVariant, "copy_top" | "copy_main" | "copy_box" | "copy_sub" | "visual"> = {};
  const copyTop = str(p.copy_top);
  const copyMain = str(p.copy_main) ?? (Array.isArray(p.copy_main) ? (p.copy_main.find((m): m is string => typeof m === "string" && m.trim().length > 0)) : undefined);
  const copyBox = str(p.copy_box) ?? (Array.isArray(p.copy_boxes) ? (p.copy_boxes.find((b): b is string => typeof b === "string" && b.trim().length > 0)) : undefined);
  const visual = str(p.visual);
  if (copyTop !== undefined) out.copy_top = copyTop;
  if (copyMain !== undefined) out.copy_main = copyMain;
  if (copyBox !== undefined) out.copy_box = copyBox;
  if (visual !== undefined) out.visual = visual;
  return out;
}

interface AbVariantRow {
  content_id: string;
  component_type: "title" | "thumbnail";
  variant: AbVariantKey;
  payload: unknown;
  ctr_pct: number | null;
  is_winner: boolean;
}

/**
 * DB에서 학습 입력(AbResultVideo[])을 구성한다.
 *   - ab_variants(component) + performance_metrics(d7 우선·없으면 d1 폴백·overall) + contents 를 코드 조인.
 *   - 영상당 variant ≥2: A/B 경로(영상 내 비교). variant 1개(제목): 영상간 CTR 순위로 single 합성.
 *   - CTR(24h) 없는 영상은 video_ctr24h=null(ctrWeightedScore 에서 ab 모드는 verdictWeight 동일·하위호환).
 */
export async function loadAbResultsFromDb(supa: Supa, component: AbComponent): Promise<AbResultVideo[]> {
  const ct = dbComponent(component);

  const { data: variants, error: ve } = await supa
    .from("ab_variants")
    .select("content_id, component_type, variant, payload, ctr_pct, is_winner")
    .eq("component_type", ct);
  if (ve) throw new Error(`ab_variants(${ct}) 조회 실패: ${ve.message}`);

  const rows = (variants ?? []) as AbVariantRow[];
  if (rows.length === 0) return [];

  const contentIds = Array.from(new Set(rows.map((r) => r.content_id)));

  // contents(topic·title) — 영상 라벨용.
  const { data: contents, error: ce } = await supa
    .from("contents")
    .select("id, title, topic")
    .in("id", contentIds);
  if (ce) throw new Error(`contents 조회 실패: ${ce.message}`);
  const labelById = new Map<string, string>();
  for (const c of contents ?? []) labelById.set(c.id, c.topic ?? c.title ?? c.id);

  // performance_metrics overall CTR·조회수 — 영상별 1건. d7·d1 둘 다 조회해 영상별로 d7 우선 선택.
  const { data: perf, error: pe } = await supa
    .from("performance_metrics")
    .select("content_id, ctr, views, metric_window")
    .in("content_id", contentIds)
    .in("metric_window", ["d1", "d7"])
    .eq("ab_variant", "overall");
  if (pe) throw new Error(`performance_metrics 조회 실패: ${pe.message}`);

  // 1주일(d7) 성과 우선 — 업로드 7일 미만·구자료는 d1 폴백. CTR 은 수동입력(노출클릭률), views 는 자동수집.
  const d7 = new Map<string, { ctr: number | null; views: number | null }>();
  const d1 = new Map<string, { ctr: number | null; views: number | null }>();
  for (const r of (perf ?? []) as { content_id: string; ctr: number | null; views: number | null; metric_window: string }[]) {
    (r.metric_window === "d7" ? d7 : d1).set(r.content_id, { ctr: r.ctr, views: r.views });
  }
  const ctrById = new Map<string, number | null>();
  const viewsById = new Map<string, number | null>();
  for (const cid of contentIds) {
    const pick = d7.get(cid) ?? d1.get(cid) ?? { ctr: null, views: null };
    ctrById.set(cid, pick.ctr);
    viewsById.set(cid, pick.views);
  }

  // 영상별로 variant 묶기.
  const byContent = new Map<string, AbVariantRow[]>();
  for (const r of rows) {
    const arr = byContent.get(r.content_id) ?? [];
    arr.push(r);
    byContent.set(r.content_id, arr);
  }

  // 단일(영상당 variant 1개) 영상 — title 에서만 발생. 영상간 CTR 순위로 winner/loser 합성.
  const singleContentIds: string[] = [];
  const abContentIds: string[] = [];
  for (const [cid, vs] of byContent) {
    if (vs.length >= 2) abContentIds.push(cid);
    else singleContentIds.push(cid);
  }

  const out: AbResultVideo[] = [];

  // ── A/B 경로(영상 내 비교) ──
  for (const cid of abContentIds) {
    const vs = byContent.get(cid)!;
    const abVariants: AbResultVariant[] = vs.map((r) => ({
      variant: r.variant,
      watch_share_pct: r.ctr_pct, // ab_variants.ctr_pct 슬롯(썸네일은 watch_share, 제목 A/B는 변형 CTR) — judgeComponent 권위.
      is_winner: r.is_winner,
      ...payloadToVariantFields(r.payload, component),
    }));
    out.push({
      topic: labelById.get(cid) ?? cid,
      youtube_video_id: cid,
      variants: abVariants,
      video_ctr24h: ctrById.get(cid) ?? null,
      video_views24h: viewsById.get(cid) ?? null,
    });
  }

  // ── single 경로(영상간 CTR 대비) ── title 단일 영상들을 CTR 내림차순 순위 → 상위 winner·하위 loser.
  if (singleContentIds.length > 0) {
    const singles = singleContentIds
      .map((cid) => {
        const v = byContent.get(cid)![0]!;
        return { cid, ctr: ctrById.get(cid) ?? null, row: v };
      })
      .sort((a, b) => (b.ctr ?? -Infinity) - (a.ctr ?? -Infinity));

    // 각 단일 영상을 그 자신의 winner(자신의 제목)로 만들고, 영상간 비교는 가중(ctrWeightedScore single)이 담당.
    //   loser 합성: CTR 이 가장 낮은 영상(들)을 대조군 loser 로 함께 전달(영상간 대비 신호 — 낚시 방지용).
    const lowest = singles[singles.length - 1];
    for (const s of singles) {
      const winnerFields = payloadToVariantFields(s.row.payload, component);
      const variantsArr: AbResultVariant[] = [
        { variant: s.row.variant, watch_share_pct: s.ctr, is_winner: true, ...winnerFields },
      ];
      // 자신이 최하위가 아니면, 최하위 영상을 loser 대조로 덧붙인다(영상간 CTR 대비).
      if (lowest && lowest.cid !== s.cid) {
        const loserFields = payloadToVariantFields(lowest.row.payload, component);
        variantsArr.push({ variant: "B", watch_share_pct: lowest.ctr, is_winner: false, ...loserFields });
      }
      out.push({
        topic: labelById.get(s.cid) ?? s.cid,
        youtube_video_id: s.cid,
        learn_mode: "single",
        variants: variantsArr,
        video_ctr24h: s.ctr,
        video_views24h: viewsById.get(s.cid) ?? null,
      });
    }
  }

  return out;
}
