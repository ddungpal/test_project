// 영상 가중 모델(comment-interest-weighting step0) — 순수·결정적·DB 접근 0.
//   댓글 관심도에 곱할 "영상 인기도 × 최신성" 가중을 계산한다. 배선(어디에 곱하나)은 다음 step.
//   ★ viewsPerSubscriber·passesQualityFloor 미러: throw 0(null/undefined/비유한/음수는 안전 기본값),
//     시간은 now 인자 주입(Date.now()·argless new Date() 금지 → 테스트 결정적).

// 최신성 가중 하한 — 아주 오래된 영상도 최소 이만큼은 기여(0으로 죽이지 않음).
export const RECENCY_FLOOR = 0.3;
// 최신성 반감 기준 개월 — 이 개월만큼 지나면 최신성 프리미엄이 절반으로.
export const HALFLIFE_MONTHS = 2;
// 인기도 로그 밑 — log_base(views + base). 밑이 클수록 조회수 스케일 압축이 세다.
export const POPULARITY_LOG_BASE = 10;

// 한 달 = 30.44일(평균 그레고리력 월). 개월 환산에 사용(passesQualityFloor의 365.25일 미러).
const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** now(Date|ISO string) → epoch ms. string이면 파싱하되 NaN(파싱 실패)이면 null. 순수(throw 0). */
function nowMs(now: Date | string): number | null {
  const t = (typeof now === "string" ? new Date(now) : now).getTime();
  return Number.isFinite(t) ? t : null;
}

/** 인기도 가중 — log_base(views + base). 1천→~3, 10만→~5, 100만→~6.
 *  조회수 스케일을 로그로 압축해 대박 영상이 점수를 폭주시키지 않게 한다(competitorSignalScore 정신 미러).
 *  views null/undefined/비유한/≤0 → 1.0 폴백(데이터 없음을 벌하지도 부풀리지도 않음). 순수(throw 0). */
export function popularityWeight(views: number | null | undefined): number {
  if (views == null || !Number.isFinite(views) || views <= 0) return 1.0;
  // log_base(x) = ln(x) / ln(base). base 로그를 캐싱할 필요 없이 결정적.
  return Math.log(views + POPULARITY_LOG_BASE) / Math.log(POPULARITY_LOG_BASE);
}

/** 최신성 가중 — FLOOR + (1-FLOOR) / (1 + ageMonths / HALFLIFE_MONTHS).
 *  방금(age 0)=1.0, 반감기(age=HALFLIFE)≈0.65, 아주 오래→FLOOR 수렴. 단조 감소.
 *  uploadDate null/파싱불가 → 1.0(데이터 없음을 벌하지 않음). 미래 날짜(ageMonths<0)는 0으로 clamp → 1.0.
 *  now 인자 주입(Date|ISO string, 파싱 실패는 1.0 폴백). 순수(throw 0). */
export function recencyWeight(uploadDate: string | null | undefined, now: Date | string): number {
  if (uploadDate == null) return 1.0;
  const up = new Date(uploadDate).getTime();
  if (!Number.isFinite(up)) return 1.0; // 파싱 불가는 벌하지 않음(최신 취급).
  const n = nowMs(now);
  if (n == null) return 1.0; // now 파싱 실패도 안전하게 프리미엄 유지.
  const ageMonths = Math.max(0, (n - up) / MS_PER_DAY / DAYS_PER_MONTH); // 미래는 0으로 clamp.
  return RECENCY_FLOOR + (1 - RECENCY_FLOOR) / (1 + ageMonths / HALFLIFE_MONTHS);
}

/** 영상 가중 = popularityWeight(views) × recencyWeight(uploadDate, now). 순수·결정적.
 *  "인기 있고 최신인 영상의 댓글일수록 관심도를 더 세게 반영" — 두 축의 곱. */
export function videoWeight(
  views: number | null | undefined,
  uploadDate: string | null | undefined,
  now: Date | string,
): number {
  return popularityWeight(views) * recencyWeight(uploadDate, now);
}

/** videoId → videoWeight 맵. DB 접근 없음(콜러가 이미 뽑아온 배열을 받는다).
 *  중복 videoId는 마지막 값으로 덮어씀(Map.set 순차). 데이터 없는 항목(views/uploadDate null)도
 *  키를 넣는다(1.0 폴백) — 조회 시 누락으로 오인하지 않게. 순수·결정적. */
export function buildVideoWeightMap(
  videos: { youtubeVideoId: string; views: number | null; uploadDate: string | null }[],
  now: Date | string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const v of videos) {
    out.set(v.youtubeVideoId, videoWeight(v.views, v.uploadDate, now));
  }
  return out;
}
