// A/B 성과 회수(Phase 4) — 순수 판정 로직(DB·시각 무관 → 테스트 용이).
//   변형별 CTR 으로 winner·rank·is_winner 와 '결정력'(decisive/marginal/inconclusive)을 산출.
//   ★ 진실 출처는 ab_variants(여기 입력). contents.ab_* 는 이 판정에서 파생되는 캐시(드리프트 차단).

import type { AbDecisiveness } from "../domain/enums.js";
import type { AbComponent, AbVariantKey } from "./types.js";

export interface AbScoreInput {
  variant: AbVariantKey;
  ctr_pct: number | null;
  impressions?: number | null;
}

export interface AbRankedVariant extends AbScoreInput {
  rank: number; // 1=최고 CTR
  is_winner: boolean;
}

export interface AbVerdict {
  component: AbComponent;
  ranked: AbRankedVariant[];
  winner: AbVariantKey | null;
  /** 승자의 차순위 대비 상대 CTR 리프트(예: 0.10 = +10%). 비교 불가 시 null. */
  margin: number | null;
  decisiveness: AbDecisiveness | null;
  /** true = 결과 확정(비교 가능한 변형 ≥2 + 승자 유효 CTR). */
  decided: boolean;
}

export interface AbThresholds {
  decisiveMargin: number;
  marginalMargin: number;
}

/**
 * 한 컴포넌트(썸네일/제목)의 변형들을 CTR 내림차순 정렬 → 승자·결정력 판정.
 *   - CTR null 변형은 순위 매기되 winner 후보에서 제외(미측정).
 *   - margin = (1등 - 2등)/2등 (상대 리프트). 2등 CTR 0 또는 음수면 margin null.
 *   - decided = 유효 CTR 변형 ≥2 (단일 변형은 비교 불가 → pending).
 */
export function judgeComponent(
  component: AbComponent,
  variants: AbScoreInput[],
  thresholds: AbThresholds,
): AbVerdict {
  // CTR 내림차순. null 은 항상 뒤로(미측정).
  const ranked: AbRankedVariant[] = [...variants]
    .sort((a, b) => ctrOf(b) - ctrOf(a))
    .map((v, i) => ({ ...v, rank: i + 1, is_winner: false }));

  const measured = ranked.filter((v) => v.ctr_pct !== null && Number.isFinite(v.ctr_pct as number));
  const top = measured[0];
  if (!top) {
    return { component, ranked, winner: null, margin: null, decisiveness: null, decided: false };
  }
  top.is_winner = true;

  const second = measured[1];
  if (!second) {
    // 비교 대상 없음 → 승자는 있으나 결정력 미확정.
    return { component, ranked, winner: top.variant, margin: null, decisiveness: null, decided: false };
  }
  const a = top.ctr_pct as number;
  const b = second.ctr_pct as number;
  const margin = b > 0 ? (a - b) / b : null;
  const decisiveness: AbDecisiveness =
    margin === null
      ? "inconclusive"
      : margin >= thresholds.decisiveMargin
        ? "decisive"
        : margin >= thresholds.marginalMargin
          ? "marginal"
          : "inconclusive";

  return { component, ranked, winner: top.variant, margin, decisiveness, decided: true };
}

/** -Infinity 정렬 키(null/비유한 CTR 은 최하위). */
function ctrOf(v: AbScoreInput): number {
  return v.ctr_pct !== null && Number.isFinite(v.ctr_pct) ? (v.ctr_pct as number) : -Infinity;
}

/**
 * 한 콘텐츠의 여러 컴포넌트 판정 중 contents.ab_* 캐시에 요약할 대표 1건 선택.
 *   - 결정(decided)된 것 우선, 그중 margin 큰 것. 썸네일·제목 동률이면 썸네일 우선(CTR 주도).
 *   - 전부 미결이면 null(캐시 = pending 유지).
 */
export function pickContentVerdict(verdicts: AbVerdict[]): AbVerdict | null {
  // margin 내림차순, 동률이면 썸네일 우선(CTR 주도). 적법한 비교자(antisymmetric)로 — x·y 모두 사용.
  const componentRank = (c: AbComponent): number => (c === "thumbnail" ? 0 : 1);
  const decided = verdicts.filter((v) => v.decided);
  const sorted = decided.sort((x, y) => {
    const dm = (y.margin ?? 0) - (x.margin ?? 0);
    if (dm !== 0) return dm;
    return componentRank(x.component) - componentRank(y.component);
  });
  return sorted[0] ?? null;
}
