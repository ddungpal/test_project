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

// ─────────────────────────────────────────────────────────────────────────────
// §13.2 학습 가중치 — A/B 결정력(영상 내 귀속) × CTR(영상 크기). 순수 함수.
//   ★ 순환 import 차단: 이 base 로직은 원래 learn-ab-style.ts 에 있었으나, learn-ab-style 이
//     judgeComponent 를 import 하므로 여기(abVerdict)로 옮겨 단방향 의존을 유지한다.
//     learn-ab-style 은 verdictWeight/LIFT_CAP/LIFT_SCALE 을 여기서 재export 한다(하위호환).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * lift 미세조정 상수(§13.2 보강).
 *   가중 = base × (1 + clamp(lift, 0, LIFT_CAP)/LIFT_SCALE). lift 0/미지정 → base(하위호환).
 *   - LIFT_CAP: lift 정규화 상한(%). 이 이상은 같은 신호로 본다(소표본 과적합·폭주 방지).
 *   - LIFT_SCALE: lift→배수 변환 스케일. CAP/SCALE 이 base 대비 최대 증폭률(15/60=0.25 → 최대 +25%).
 */
export const LIFT_CAP = 15;
export const LIFT_SCALE = 60;

/** decisive/marginal 의 기본 가중(lift 무시 시 정확히 이 값). inconclusive 는 항상 0. */
function baseWeight(verdict: AbDecisiveness): number {
  switch (verdict) {
    case "decisive":
      return 1.0;
    case "marginal":
      return 0.5;
    default:
      return 0;
  }
}

/**
 * §13.2 base 가중치 — A/B 결정력 → 학습 가중(+ relative_lift_pct 미세조정).
 *   decisive 1.0 / marginal 0.5 / inconclusive 0(학습 보류)를 base 로,
 *   lift 가 주어지면 base × (1 + clamp(lift,0,CAP)/SCALE) 로 단조 미세조정한다.
 *   - lift 미지정/0/음수 → base 와 정확히 동일(하위호환). inconclusive 는 lift 무관 항상 0.
 *   - clamp 상한(CAP)으로 폭주 방지: 매우 큰 lift 도 base×(1+CAP/SCALE) 를 넘지 않는다.
 *   결정적·단조(높은 lift → 높은 weight, 단 상한 이하). 순수 함수.
 */
export function verdictWeight(verdict: AbDecisiveness, relativeLiftPct?: number): number {
  const base = baseWeight(verdict);
  if (base === 0) return 0; // inconclusive: lift 무관 항상 0.
  if (relativeLiftPct === undefined) return base; // 하위호환: 미지정이면 정확히 base.
  const lift = Math.min(Math.max(relativeLiftPct, 0), LIFT_CAP); // [0, CAP] 로 클램프(음수→0).
  return base * (1 + lift / LIFT_SCALE);
}

export interface CtrWeightArgs {
  decisiveness: AbDecisiveness;
  relativeLiftPct?: number;
  /** 영상(24h) CTR(%). null 이면 CTR 무가중 → verdictWeight 와 정확히 동일(하위호환). */
  videoCtr24h: number | null;
  /** "ab"=영상 내 A/B 귀속(verdictWeight × CTR) · "single"=영상 내 비교 없음, CTR 크기 자체가 신호. */
  mode: "ab" | "single";
}

/** CTR(%)을 [0,1] 부근으로 정규화 — log1p(clamp(ctr,0,cap)) / log1p(cap). cap=0 또는 음수면 0(무가중). */
function normCtr(videoCtr24h: number, cap: number): number {
  if (cap <= 0) return 0;
  const ctr = Math.min(Math.max(videoCtr24h, 0), cap); // [0, cap] 클램프(음수·폭주 차단).
  return Math.log1p(ctr) / Math.log1p(cap); // 단조 증가, [0,1].
}

/**
 * §13.2 CTR 합성 가중 — CTR(영상 크기) × A/B(영상 내 귀속). 순수 함수.
 *   - mode="ab": base=verdictWeight(결정력×lift). CTR 없으면 base 그대로(하위호환).
 *       CTR 있으면 base × (1 + boost × normCtr) — CTR 클수록 가중↑(상한 클램프). inconclusive→0(CTR 무관).
 *   - mode="single"(제목 단일): 영상 내 비교 없음 → CTR 크기 자체가 양의 신호.
 *       base = decisive 가중(1.0)을 기준으로 CTR 정규화 비례(고CTR=강신호, 저CTR=약/loser).
 *       CTR 없으면 0(비교 신호 없음 → 학습 보류, 하위호환적 안전).
 *   ★ CTR 없을 때(videoCtr24h=null) ab 모드는 verdictWeight 와 정확히 동일(회귀 방지).
 *   ★ A/B(체류) 인자 유지 — single 도 순수 CTR 최적화가 아니라 CTR '상관' 신호로만(낚시 드리프트 방지).
 */
export function ctrWeightedScore(args: CtrWeightArgs, thresholds: AbThresholds & { ctrNormCap: number; ctrBoostFactor: number }): number {
  const { decisiveness, relativeLiftPct, videoCtr24h, mode } = args;
  const cap = thresholds.ctrNormCap;
  const boost = thresholds.ctrBoostFactor;

  if (mode === "single") {
    // 영상 내 A/B 없음 → CTR 크기 자체가 가중. CTR 없으면 0(비교 신호 부재).
    if (videoCtr24h === null || !Number.isFinite(videoCtr24h)) return 0;
    return normCtr(videoCtr24h, cap); // [0,1] — 고CTR=강신호, 저CTR=약신호(loser 대비).
  }

  // mode="ab": 영상 내 귀속 base × CTR 증폭.
  const base = relativeLiftPct === undefined ? verdictWeight(decisiveness) : verdictWeight(decisiveness, relativeLiftPct);
  if (base === 0) return 0; // inconclusive: CTR 무관 항상 0.
  if (videoCtr24h === null || !Number.isFinite(videoCtr24h)) return base; // 하위호환: CTR 없으면 base 그대로.
  return base * (1 + boost * normCtr(videoCtr24h, cap));
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
