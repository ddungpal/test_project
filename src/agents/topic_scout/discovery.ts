// 매일 발굴(B) — 코드 전용 신호 수집기(LLM 0회·governance C). 댓글 집계 + 외부 트렌드/경쟁 →
//   topic_candidates 에 멱등 upsert(dedup_key·last_seen_at). 촉이(LLM)는 다음 런에서 이 풀을 읽어 승격.
//   ★ §8.1: AI는 게이트서 1회. 이 Cron은 데이터 수집기지 생성기가 아니다 → ~$0(검색만, 운영 record 모드).
//   ★ 신선도: 트렌드 쿼리 volatility='fast'(TTL 1h) → 매일 실행마다 라이브 갱신(운영). 개발(replay)은 결정적.

import type { Supa } from "../../pipeline/runState.js";
import type { TablesInsert, Json } from "../../lib/supabase/database.types.js";
import { aggregateCommentSignals } from "./commentSignals.js";
import { buildVideoWeightMap } from "./videoWeight.js";
import { gatherExternalSignals, viewsPerSubscriber, engagementRate, type ExternalItem } from "./externalSignals.js";
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

/** 외부 신호 1건 → 경쟁(competitor) 후보 행. 순수·결정적(refreshTopicCandidates 루프에서 추출).
 *  주제 발굴 유튜브 only(옵션 A): source!=='youtube'(웹 트렌드 등)는 null(후보 미생성 — 'trend' 후보 안 만듦).
 *  url 없음·품질 바닥(저조회·노후) 미통과도 null. youtube 경쟁영상만 competitor 후보가 된다. */
export function buildCompetitorCandidate(
  e: ExternalItem,
  opts: { minViews: number; maxAgeYears: number; nowIso: string },
): CandidateRow | null {
  if (e.source !== "youtube") return null; // 유튜브 only — 웹 트렌드는 주제 후보 아님(방어).
  if (!e.url) return null;
  // D) 품질 바닥: youtube 경쟁영상 컷(저조회·노후).
  if (!passesQualityFloor(e.viewCount, e.published_at, { minViews: opts.minViews, maxAgeYears: opts.maxAgeYears, now: opts.nowIso })) {
    return null;
  }
  // 경쟁 영상: 구독 대비 조회수 배수(아웃라이어). null=비공개·노이즈 컷·FLOOR_SUBS 미만 → score는 조회수 폴백.
  const mult = viewsPerSubscriber(e.viewCount, e.subscriberCount, FLOOR_SUBS);
  // B) 반응도(좋아요+댓글)/조회수 — externalSignals.engagementRate 재사용(재구현 금지). null이면 score 회귀 0.
  const eng = engagementRate(e.viewCount, e.likeCount, e.commentCount);
  return {
    source: "competitor",
    title: e.title || e.url,
    rationale: `경쟁 영상${e.viewCount != null ? ` · 조회 ${e.viewCount.toLocaleString()}` : ""}${mult != null ? ` · 구독대비 ${Math.round(mult)}배` : ""}${eng != null ? ` · 반응도 ${(eng * 100).toFixed(1)}%` : ""}${e.publisher ? ` · ${e.publisher}` : ""}`,
    // 경쟁: 조회수 로그 스케일에 배수·반응도 가중(아웃라이어 우선·폭발 방지).
    signal_score: competitorSignalScore(e.viewCount, e.subscriberCount, eng),
    evidence: {
      kind: "competitor_video",
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
    dedup_key: `competitor:${e.url}`,
    last_seen_at: opts.nowIso,
  };
}

/**
 * videoId → 영상 가중 맵(공유). discovery·prepare 둘 다 댓글에 "인기도×최신성" 가중을 붙일 때 쓴다.
 *   contents(upload_date) + performance_metrics(views, window='d1')를 조인해 buildVideoWeightMap에 넘긴다.
 *   ★ best-effort: 두 쿼리 에러/빈 결과여도 throw 하지 않고 빈 Map 반환 → 성과 데이터 부재 시 가중 없이 기존 동작으로 강등.
 *   ★ now 주입으로 결정적(콜러가 nowIso 전달 — recencyWeight가 이 now를 쓴다).
 *   ★ metric_window='d1' 고정: 다른 window는 views가 전부 null이라 가중이 죽는다.
 */
export async function loadVideoWeightMap(supa: Supa, now: Date | string): Promise<Map<string, number>> {
  // contents: 업로드일 + youtube_video_id(가중 키). youtube_video_id null 행은 키가 될 수 없어 제외.
  const { data: contents, error: cerr } = await supa
    .from("contents")
    .select("id, youtube_video_id, upload_date")
    .not("youtube_video_id", "is", null);
  if (cerr || !contents || contents.length === 0) return new Map();

  // performance_metrics: d1 views만(다른 window는 views null → 가중 죽음). content_id → views 맵.
  const { data: metrics } = await supa
    .from("performance_metrics")
    .select("content_id, views")
    .eq("metric_window", "d1");
  const viewsByContent = new Map<string, number | null>();
  for (const m of metrics ?? []) viewsByContent.set(m.content_id, m.views);

  // 조인: contents 각 행 → { youtubeVideoId, views, uploadDate }. views 없으면 null(폴백은 순수부가 처리).
  const videos = contents
    .filter((c): c is typeof c & { youtube_video_id: string } => c.youtube_video_id != null)
    .map((c) => ({
      youtubeVideoId: c.youtube_video_id,
      views: viewsByContent.get(c.id) ?? null,
      uploadDate: c.upload_date,
    }));
  return buildVideoWeightMap(videos, now);
}

/**
 * 전역 발굴 1회. supa = service-role(admin) 클라이언트. asOfYear = 트렌드 쿼리 연도(테스트 주입용).
 *   - 댓글: 광역 키워드 신호 top → source='comment'
 *   - YouTube 경쟁영상: source='competitor' (주제 발굴 유튜브 only — web 트렌드 후보 미생성, trend는 항상 0)
 *   - upsert: status 미포함(승격/반려 보존), last_seen_at·signal_score·evidence 갱신.
 */
export async function refreshTopicCandidates(
  supa: Supa,
  opts: { asOfYear?: string; nowIso?: string } = {},
): Promise<DiscoveryResult> {
  const asOfYear = opts.asOfYear ?? new Date().getFullYear().toString();
  const nowIso = opts.nowIso ?? new Date().toISOString();

  // 1) 댓글 광역 신호(원문 비전송) — 공유 헬퍼. youtube_video_id로 영상 가중을 붙인다.
  const { data: comments, error: ce } = await supa
    .from("comments_raw")
    .select("body, like_count, youtube_video_id")
    .is("redacted_at", null)
    .not("body", "is", null)
    .order("posted_at", { ascending: false }) // limit(5000)이 임의 순서가 되지 않게 최근순.
    .limit(5000);
  if (ce) throw new Error(`comments_raw 조회 실패: ${ce.message}`);
  // 영상 가중 맵(인기도×최신성). best-effort — 성과 데이터 없으면 빈 맵 → weight 1 폴백(기존 동작).
  const wmap = await loadVideoWeightMap(supa, nowIso);
  const commentRows = (comments ?? []).map((c) => ({
    body: c.body,
    like_count: c.like_count,
    weight: wmap.get(c.youtube_video_id) ?? 1,
  }));
  const { keyword_signals } = aggregateCommentSignals(commentRows);
  const topComment = keyword_signals.slice(0, 10);

  // 2) 외부 경쟁영상(YouTube only). 주제 발굴은 유튜브 영상 기준 — 웹 트렌드 기사(Tavily)는 제거.
  //   ytQueries: top-3 댓글 키워드로 검색 확장(경쟁영상이 여러 테마로 퍼지게), 없으면 연도 재테크 폴백.
  //   ponytail: 3 keywords × 2-pass = ~600 quota/run (N=3 상한; dev는 fixture $0).
  const ytQueries = topComment.slice(0, 3).map((c) => c.term).filter((t) => t.trim().length > 0);
  const external = await gatherExternalSignals({
    webQueries: [], // 웹 트렌드 검색 안 함(주제 발굴 유튜브 only).
    ytQueries: ytQueries.length ? ytQueries : [`${asOfYear} 재테크`],
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
    // 유튜브 only(옵션 A): web 트렌드는 주제 후보로 안 만든다(헬퍼가 null 반환 — webQueries=[]라 안 들어오지만 방어).
    const row = buildCompetitorCandidate(e, { minViews: FLOOR_MIN_VIEWS, maxAgeYears: FLOOR_MAX_AGE_YEARS, nowIso });
    if (row) put(row);
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
