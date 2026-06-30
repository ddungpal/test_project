// 매일 발굴(B) — 코드 전용 신호 수집기(LLM 0회·governance C). 댓글 집계 + 외부 트렌드/경쟁 →
//   topic_candidates 에 멱등 upsert(dedup_key·last_seen_at). 촉이(LLM)는 다음 런에서 이 풀을 읽어 승격.
//   ★ §8.1: AI는 게이트서 1회. 이 Cron은 데이터 수집기지 생성기가 아니다 → ~$0(검색만, 운영 record 모드).
//   ★ 신선도: 트렌드 쿼리 volatility='fast'(TTL 1h) → 매일 실행마다 라이브 갱신(운영). 개발(replay)은 결정적.

import type { Supa } from "../../pipeline/runState.js";
import type { TablesInsert, Json } from "../../lib/supabase/database.types.js";
import { aggregateCommentSignals } from "./commentSignals.js";
import { gatherExternalSignals, viewsPerSubscriber, engagementRate } from "./externalSignals.js";
import { FLOOR_SUBS } from "../hook_maker/externalRefs.js";

// 품질 바닥(D) 상수 — youtube 경쟁영상 후보 컷. 댓글·웹 트렌드엔 적용 안 함(viewCount 없음).
//   MIN_VIEWS: 1만 미만은 경쟁 레퍼런스로 신호가 약함(아웃라이어 가치 낮음) → 컷.
//   MAX_AGE_YEARS: 3년 초과 영상은 시의성 낮음(재테크 제도·트렌드 빠르게 변함) → 컷.
const FLOOR_MIN_VIEWS = 10_000;
const FLOOR_MAX_AGE_YEARS = 3;

export interface DiscoveryResult {
  comment: number;
  trend: number;
  competitor: number;
  total: number;
}

type CandidateRow = TablesInsert<"topic_candidates">;

// 반응도 가중 계수(B) — engagementRate(=(좋아요+댓글)/조회수)에 곱하는 k.
//   재테크 영상 통상 반응도는 1~3%(0.01~0.03) 수준. k=5면 반응도 2%일 때 가중 ×1.1,
//   극단적 10%여도 ×1.5로 폭주를 막는다(배수 가중과 곱해져 점수 폭발 방지). 단조 증가 유지.
const ENGAGEMENT_K = 5;

/** 경쟁(youtube) 영상 후보의 signal_score — 조회수 로그 스케일에 배수(아웃라이어)·반응도 가중.
 *  배수 있으면 log10(views+1) * (1 + log10(mult+1)): views 단조증가 × 배수 단조증가, 결정적.
 *  배수 null(비공개·노이즈 컷·FLOOR_SUBS 미만)이면 기존 log10(views+1) 폴백(회귀 최소).
 *  반응도 가중: × (1 + ENGAGEMENT_K * engagementRate). engagement(=engagementRate 결과) null이면 ×1(회귀 0).
 *  배수·반응도 둘 다 null이면 기존 조회수 폴백과 정확히 동일.
 *  순수함수. 소수 둘째 자리 반올림(폭발 방지·결정성). */
export function competitorSignalScore(
  viewCount: number | null,
  subscriberCount: number | null,
  engagement: number | null = null,
): number {
  if (viewCount == null) return 1; // 조회수 없으면 presence 기본점(기존 폴백과 동일).
  const base = Math.log10(viewCount + 1);
  const mult = viewsPerSubscriber(viewCount, subscriberCount, FLOOR_SUBS);
  const multWeighted = mult == null ? base : base * (1 + Math.log10(mult + 1));
  // engagement null → ×1(회귀 0). 음수 방어(이론상 없지만 단조성 보장).
  const engFactor = engagement != null && engagement > 0 ? 1 + ENGAGEMENT_K * engagement : 1;
  return Math.round(multWeighted * engFactor * 100) / 100;
}

/** 품질 바닥 필터(D) — youtube 경쟁영상 후보용 순수·결정적 게이트.
 *  viewCount < minViews → false(신호 약한 저조회). publishedAt이 maxAgeYears보다 오래면 false(시의성 낮음).
 *  publishedAt null이면 통과(데이터 없음을 벌하지 않음). now 주입으로 테스트 가능.
 *  댓글·웹 트렌드 후보엔 호출하지 않는다(viewCount 없어 전부 탈락 방지 — 콜러 책임). */
export function passesQualityFloor(
  viewCount: number | null,
  publishedAt: string | null,
  opts: { minViews: number; maxAgeYears: number; now: Date | string },
): boolean {
  if (viewCount == null || viewCount < opts.minViews) return false;
  if (publishedAt == null) return true; // 발행일 미상은 통과(벌하지 않음).
  const pub = new Date(publishedAt).getTime();
  if (!Number.isFinite(pub)) return true; // 파싱 불가도 벌하지 않음(통과).
  const now = (typeof opts.now === "string" ? new Date(opts.now) : opts.now).getTime();
  const ageMs = now - pub;
  const maxAgeMs = opts.maxAgeYears * 365.25 * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs;
}

/** 댓글 용어 정규화 — dedup_key 안정화(공백 압축·소문자·NFC). */
function termKey(term: string): string {
  return term.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 전역 발굴 1회. supa = service-role(admin) 클라이언트. asOfYear = 트렌드 쿼리 연도(테스트 주입용).
 *   - 댓글: 광역 키워드 신호 top → source='comment'
 *   - 웹 트렌드: source='trend' / YouTube 경쟁영상: source='competitor'
 *   - upsert: status 미포함(승격/반려 보존), last_seen_at·signal_score·evidence 갱신.
 */
export async function refreshTopicCandidates(
  supa: Supa,
  opts: { asOfYear?: string; nowIso?: string } = {},
): Promise<DiscoveryResult> {
  const asOfYear = opts.asOfYear ?? new Date().getFullYear().toString();
  const nowIso = opts.nowIso ?? new Date().toISOString();

  // 1) 댓글 광역 신호(원문 비전송) — 공유 헬퍼.
  const { data: comments, error: ce } = await supa
    .from("comments_raw")
    .select("body, like_count")
    .is("redacted_at", null)
    .not("body", "is", null)
    .limit(5000);
  if (ce) throw new Error(`comments_raw 조회 실패: ${ce.message}`);
  const { keyword_signals } = aggregateCommentSignals(comments ?? []);
  const topComment = keyword_signals.slice(0, 10);

  // 2) 외부 트렌드/경쟁(댓글 비의존 신규 테마). 트렌드 앵커는 댓글 top 1개만 곁들임.
  const webQueries = [
    ...(topComment[0] ? [`${topComment[0].term} 재테크`] : []),
    `${asOfYear} 재테크 트렌드`,
    `${asOfYear} 재테크 신규 제도·정책`,
    "요즘 뜨는 재테크 이슈",
  ];
  const external = await gatherExternalSignals({
    webQueries,
    ytQuery: topComment[0]?.term ?? `${asOfYear} 재테크`,
    maxPerQuery: 5,
    volatility: "fast",
  });

  // 3) 후보 행 빌드 — dedup_key 로 멱등. 같은 키는 마지막 값으로 합침(ON CONFLICT 이중영향 방지).
  const byKey = new Map<string, CandidateRow>();
  const put = (row: CandidateRow) => byKey.set(row.dedup_key!, row);

  for (const s of topComment) {
    put({
      source: "comment",
      title: s.term,
      rationale: `댓글에서 반복 언급(가중 ${s.count})`,
      signal_score: s.count,
      evidence: { kind: "comment_keyword", term: s.term, weighted_count: s.count } as Json,
      dedup_key: `comment:${termKey(s.term)}`,
      last_seen_at: nowIso,
    });
  }
  for (const e of external) {
    if (!e.url) continue;
    const isYt = e.source === "youtube";
    // D) 품질 바닥: youtube 경쟁영상만 컷(저조회·노후). 댓글·트렌드는 대상 아님(viewCount 없음 → 적용 시 전멸).
    if (isYt && !passesQualityFloor(e.viewCount, e.published_at, { minViews: FLOOR_MIN_VIEWS, maxAgeYears: FLOOR_MAX_AGE_YEARS, now: nowIso })) {
      continue; // 후보 만들지 않음.
    }
    // 경쟁 영상: 구독 대비 조회수 배수(아웃라이어). null=비공개·노이즈 컷·FLOOR_SUBS 미만 → score는 조회수 폴백.
    const mult = isYt ? viewsPerSubscriber(e.viewCount, e.subscriberCount, FLOOR_SUBS) : null;
    // B) 반응도(좋아요+댓글)/조회수 — externalSignals.engagementRate 재사용(재구현 금지). null이면 score 회귀 0.
    const eng = isYt ? engagementRate(e.viewCount, e.likeCount, e.commentCount) : null;
    put({
      source: isYt ? "competitor" : "trend",
      title: e.title || e.url,
      rationale: isYt
        ? `경쟁 영상${e.viewCount != null ? ` · 조회 ${e.viewCount.toLocaleString()}` : ""}${mult != null ? ` · 구독대비 ${Math.round(mult)}배` : ""}${eng != null ? ` · 반응도 ${(eng * 100).toFixed(1)}%` : ""}${e.publisher ? ` · ${e.publisher}` : ""}`
        : `웹 트렌드${e.publisher ? ` · ${e.publisher}` : ""}`,
      // 경쟁: 조회수 로그 스케일에 배수·반응도 가중(아웃라이어 우선·폭발 방지) / 트렌드: presence 기본점.
      signal_score: isYt ? competitorSignalScore(e.viewCount, e.subscriberCount, eng) : 1,
      evidence: {
        kind: isYt ? "competitor_video" : "web_trend",
        url: e.url,
        publisher: e.publisher,
        published_at: e.published_at,
        view_count: e.viewCount,
        subscriber_count: e.subscriberCount,
        multiplier: mult,
        like_count: e.likeCount,
        comment_count: e.commentCount,
        engagement_rate: eng,
      } as Json,
      dedup_key: `${isYt ? "competitor" : "trend"}:${e.url}`,
      last_seen_at: nowIso,
    });
  }

  const rows = [...byKey.values()];
  if (rows.length) {
    // status 미포함 → 충돌 시 보존(승격/반려), 신규 시 DB 기본값 'new'.
    const { error: ue } = await supa.from("topic_candidates").upsert(rows, { onConflict: "dedup_key" });
    if (ue) throw new Error(`topic_candidates upsert 실패: ${ue.message}`);
  }

  const count = (src: CandidateRow["source"]) => rows.filter((r) => r.source === src).length;
  return { comment: count("comment"), trend: count("trend"), competitor: count("competitor"), total: rows.length };
}
