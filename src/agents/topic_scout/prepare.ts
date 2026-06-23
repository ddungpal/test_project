// 촉이 결정적 prep — 댓글 마이닝(§8.1: 데이터는 백엔드가 가공, AI는 준비된 데이터 위 1회).
// ★ governance C안: 댓글 '원문'은 LLM에 전송하지 않는다. 여기서 코드로 집계(키워드 빈도·질문 카운트)만 산출.
//   시청자 사연(개인정보)의 국외 이전을 구조적으로 차단하면서도 신호는 보존한다.

import { setProgress, type Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import type { ProposalSource } from "../../lib/dashboard/proposalTypes.js";
import { TOPIC_SCOUT_SCHEMA, TOPIC_SCOUT_SYSTEM, appendLevelDirective } from "./schema.js";
import { gatherExternalSignals, type ExternalItem } from "./externalSignals.js";
import { aggregateCommentSignals } from "./commentSignals.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";

// stripJosa 등 댓글 키워드 집계는 commentSignals.ts(매일 발굴 Cron과 공유). 하위호환 re-export.
export { stripJosa } from "./commentSignals.js";

export interface TopicScoutInput {
  focus_keyword: string | null; // 키워드 발굴 모드면 그 키워드, 광역 발굴이면 null
  comment_count: number;
  question_comment_count: number; // 질문성 댓글 수(주제 수요 신호)
  keyword_signals: { id: string; term: string; count: number }[];
  external_items: ExternalItem[]; // 외부 검색(웹·YouTube) 트렌드·경쟁 신호
  overlap_terms: string[]; // 댓글 ∩ 외부 교집합(우선순위 신호)
  existing_candidates: { id: string; title: string | null; status: string }[];
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'topic' 학습 규칙 — 있을 때만(픽스처 해시 보존)
}

/**
 * 댓글(원문 비전송) 집계 + 외부 검색(웹·YouTube) → 융합 → 촉이 입력(§8.1 결정적 prep).
 *   - content.topic 있으면 '키워드 발굴'(그 키워드 댓글 군집 + 키워드 검색), 없으면 '광역 발굴'.
 *   - 거버넌스 C: 외부엔 집계 키워드 쿼리만 나감(댓글 원문 아님).
 */
export async function prepareTopicScout(
  supa: Supa,
  runId: string,
  opts?: { levelSplit?: boolean },
): Promise<{ system: string; input: TopicScoutInput; schema: JsonSchema; sources: ProposalSource[] }> {
  // 0) 이 run의 키워드(content.topic). 있으면 키워드 발굴 모드. as_of_date로 트렌드 쿼리 연도 도출.
  let keyword: string | null = null;
  let asOfYear = "2026";
  const { data: run } = await supa.from("production_runs").select("content_id, as_of_date").eq("id", runId).maybeSingle();
  if (run) {
    if (run.as_of_date) asOfYear = run.as_of_date.slice(0, 4);
    const { data: content } = await supa.from("contents").select("topic").eq("id", run.content_id).maybeSingle();
    keyword = content?.topic?.trim() || null;
  }
  await setProgress(supa, runId, "1/3·댓글 신호 분석");

  // 1) 댓글 본문 로드(redacted 제외). 본문은 코드 안에서만 쓰고 버린다(거버넌스 C). 집계는 공유 헬퍼.
  const { data: comments, error: ce } = await supa
    .from("comments_raw")
    .select("body, like_count")
    .is("redacted_at", null)
    .not("body", "is", null)
    .limit(5000);
  if (ce) throw new Error(`comments_raw 조회 실패: ${ce.message}`);
  const { comment_count, question_comment_count, keyword_signals } = aggregateCommentSignals(comments ?? [], { keyword });

  // 2) 외부 검색 신호(웹 Tavily + YouTube 경쟁영상).
  //   키워드 모드: 그 키워드 집중. 발굴 모드: 댓글 앵커 1 + ★댓글 비의존 트렌드 쿼리(신규 제도·트렌드·시의성)
  //   → 댓글이 그대로여도 새 테마가 들어온다(시청자 수요를 앞서가는 발굴).
  const topTerms = keyword_signals.slice(0, 3).map((s) => s.term);
  const webQueries = keyword
    ? [keyword, `${keyword} 재테크`]
    : [
        ...(topTerms[0] ? [`${topTerms[0]} 재테크`] : []), // 댓글 앵커(시청자 관련성)
        `${asOfYear} 재테크 트렌드`, // 트렌드(댓글 비의존)
        `${asOfYear} 재테크 신규 제도·정책`, // 신규 제도/정책
        "요즘 뜨는 재테크 이슈", // 시의성 이슈
      ];
  await setProgress(supa, runId, "2/3·외부 검색 (웹·YouTube)");
  // 발굴 모드 트렌드 쿼리는 fast(매일 갱신), 키워드 모드는 slow(특정 키워드·덜 시변).
  const gathered = await gatherExternalSignals({
    webQueries,
    ytQuery: keyword ?? topTerms[0],
    maxPerQuery: keyword ? 5 : 4,
    volatility: keyword ? "slow" : "fast",
  });
  // LLM 입력 토큰 캡 — 소스별로 잘라 YouTube 신호가 web에 묻히지 않게(웹12·유튜브6).
  const external_items = [
    ...gathered.filter((e) => e.source === "web").slice(0, 12),
    ...gathered.filter((e) => e.source === "youtube").slice(0, 6),
  ];

  // 3) 융합 — 댓글 키워드가 외부 결과(제목·스니펫)에도 등장 = 교집합(시청자 수요 ∩ 외부 트렌드).
  const extText = external_items.map((e) => `${e.title} ${e.snippet}`).join(" ").normalize("NFC");
  const overlap_terms = keyword_signals.filter((s) => extText.includes(s.term)).map((s) => s.term).slice(0, 15);

  // 4) 기존 주제 후보(촉이가 중복·승격 판단에 참고).
  const { data: tcs, error: te } = await supa
    .from("topic_candidates")
    .select("id, title, status")
    .in("status", ["new", "shortlisted"])
    .order("signal_score", { ascending: false, nullsFirst: false })
    .limit(20);
  if (te) throw new Error(`topic_candidates 조회 실패: ${te.message}`);

  await setProgress(supa, runId, "3/3·주제 후보 생성 (AI)"); // 다음=callLLM(가장 오래 걸리는 부분)
  const input: TopicScoutInput = {
    focus_keyword: keyword,
    comment_count,
    question_comment_count,
    keyword_signals,
    external_items,
    overlap_terms,
    existing_candidates: (tcs ?? []).map((t) => ({ id: `tc:${t.id}`, title: t.title, status: t.status })),
  };
  // 검색 출처(웹·YouTube) — 제안에 저장해 토글로 원문 확인(출처명시).
  const sources: ProposalSource[] = external_items.map((e) => ({
    id: e.id,
    source: e.source,
    title: e.title,
    url: e.url,
    publisher: e.publisher,
    viewCount: e.viewCount,
    subscriberCount: e.subscriberCount,
  }));

  // 환류(슬라이스 4) — 승인된 'topic' 학습 규칙을 주입. 있을 때만 input/system에 반영(없으면 기존 해시 보존).
  const learned = await loadApprovedInsights(supa, ["topic"], run?.as_of_date ? { asOf: run.as_of_date } : {});
  if (learned.length) input.learned_insights = learned;
  // 수준(audience_level) 지시 — 토글에 따라 분해/라벨. 정의는 항상 포함.
  const system = appendLevelDirective(appendLearnedInsights(TOPIC_SCOUT_SYSTEM, learned), !!opts?.levelSplit);
  return { system, input, schema: TOPIC_SCOUT_SCHEMA, sources };
}
