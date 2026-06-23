// 매일 발굴(B) — 코드 전용 신호 수집기(LLM 0회·governance C). 댓글 집계 + 외부 트렌드/경쟁 →
//   topic_candidates 에 멱등 upsert(dedup_key·last_seen_at). 촉이(LLM)는 다음 런에서 이 풀을 읽어 승격.
//   ★ §8.1: AI는 게이트서 1회. 이 Cron은 데이터 수집기지 생성기가 아니다 → ~$0(검색만, 운영 record 모드).
//   ★ 신선도: 트렌드 쿼리 volatility='fast'(TTL 1h) → 매일 실행마다 라이브 갱신(운영). 개발(replay)은 결정적.

import type { Supa } from "../../pipeline/runState.js";
import type { TablesInsert, Json } from "../../lib/supabase/database.types.js";
import { aggregateCommentSignals } from "./commentSignals.js";
import { gatherExternalSignals } from "./externalSignals.js";

export interface DiscoveryResult {
  comment: number;
  trend: number;
  competitor: number;
  total: number;
}

type CandidateRow = TablesInsert<"topic_candidates">;

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
    put({
      source: isYt ? "competitor" : "trend",
      title: e.title || e.url,
      rationale: isYt
        ? `경쟁 영상${e.viewCount != null ? ` · 조회 ${e.viewCount.toLocaleString()}` : ""}${e.publisher ? ` · ${e.publisher}` : ""}`
        : `웹 트렌드${e.publisher ? ` · ${e.publisher}` : ""}`,
      // 경쟁: 조회수 로그 스케일(폭발 방지) / 트렌드: presence 기본점.
      signal_score: isYt && e.viewCount != null ? Math.round(Math.log10(e.viewCount + 1) * 100) / 100 : 1,
      evidence: {
        kind: isYt ? "competitor_video" : "web_trend",
        url: e.url,
        publisher: e.publisher,
        published_at: e.published_at,
        view_count: e.viewCount,
        subscriber_count: e.subscriberCount,
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
