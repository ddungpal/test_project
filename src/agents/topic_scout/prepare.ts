// 촉이 결정적 prep — 댓글 마이닝(§8.1: 데이터는 백엔드가 가공, AI는 준비된 데이터 위 1회).
// ★ governance C안: 댓글 '원문'은 LLM에 전송하지 않는다. 여기서 코드로 집계(키워드 빈도·질문 카운트)만 산출.
//   시청자 사연(개인정보)의 국외 이전을 구조적으로 차단하면서도 신호는 보존한다.

import { setProgress, type Supa } from "../../pipeline/runState.js";
import type { JsonSchema } from "../../llm/types.js";
import type { ProposalSource } from "../../lib/dashboard/proposalTypes.js";
import { TOPIC_SCOUT_SCHEMA, TOPIC_SCOUT_SYSTEM, appendLevelDirective, appendPersonaDirective } from "./schema.js";
import { gatherExternalSignals, pickSpreadYoutube, type ExternalItem } from "./externalSignals.js";
import { FLOOR_SUBS } from "../hook_maker/externalRefs.js";
import { aggregateCommentSignals } from "./commentSignals.js";
import { loadVideoWeightMap } from "./discovery.js";
import { loadApprovedInsights, appendLearnedInsights, type LearnedInsight } from "../shared/approvedInsights.js";

// stripJosa 등 댓글 키워드 집계는 commentSignals.ts(매일 발굴 Cron과 공유). 하위호환 re-export.
export { stripJosa } from "./commentSignals.js";

export interface TopicScoutInput {
  focus_keyword: string | null; // 키워드 발굴 모드면 그 키워드, 광역 발굴이면 null
  comment_count: number;
  question_comment_count: number; // 질문성 댓글 수(주제 수요 신호)
  keyword_signals: { id: string; term: string; count: number }[];
  external_items: ExternalItem[]; // 외부 검색(YouTube 경쟁영상) 신호 — 주제 경로는 유튜브 only
  overlap_terms: string[]; // 댓글 ∩ 외부 교집합(우선순위 신호)
  existing_candidates: { id: string; title: string | null; status: string }[];
  learned_insights?: LearnedInsight[]; // 환류(슬라이스 4): 승인된 'topic' 학습 규칙 — 있을 때만(픽스처 해시 보존)
}

/**
 * 댓글(원문 비전송) 집계 + 외부 검색(YouTube 경쟁영상 only) → 융합 → 촉이 입력(§8.1 결정적 prep).
 *   - content.topic 있으면 '키워드 발굴'(그 키워드 댓글 군집 + 키워드 검색), 없으면 '광역 발굴'.
 *   - 거버넌스 C: 외부엔 집계 키워드 쿼리만 나감(댓글 원문 아님).
 */
export async function prepareTopicScout(
  supa: Supa,
  runId: string,
  opts?: { levelSplit?: boolean; targetPersona?: string }, // targetPersona: 배선만(step0) — 프롬프트 주입은 step1 몫.
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
  //   per-run엔 nowIso가 없어 진입부에서 앱 서버 런타임 값을 한 번 만든다(스크립트 컨텍스트 아님 → new Date() 허용).
  const nowIso = new Date().toISOString();
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
  const { comment_count, question_comment_count, keyword_signals } = aggregateCommentSignals(commentRows, { keyword });

  // 2) 외부 검색 신호(YouTube 경쟁영상 only). 주제 선정은 유튜브 영상 기준 — 웹 기사(Tavily)는
  //   주제 경로에서 제거(기사는 리서치 단계용).
  //   키워드 모드: 그 키워드 단일 검색(focus 의도 유지). 발굴 모드: top-3 distinct 수요 키워드로 검색 확장
  //     → 외부 영상이 한 테마로 쏠리지 않고 여러 테마를 커버(쏠림 버그 픽스).
  //   ponytail: 3 keywords × 2-pass = ~600 quota/run (N=3 상한; dev는 fixture $0).
  const topTerms = keyword_signals.slice(0, 3).map((s) => s.term).filter((t) => t.trim().length > 0);
  await setProgress(supa, runId, "2/3·외부 검색 (YouTube)");
  // 발굴 모드는 fast(매일 갱신), 키워드 모드는 slow(특정 키워드·덜 시변).
  const gathered = await gatherExternalSignals({
    webQueries: [], // 웹 Tavily 호출 안 함(주제 경로 유튜브 only).
    ytQueries: keyword ? [keyword] : topTerms, // 키워드 모드 단일, 발굴 모드 top-3.
    maxPerQuery: keyword ? 5 : 4,
    volatility: keyword ? "slow" : "fast",
  });
  // LLM 입력 토큰 캡 — YouTube만. 테마(sourceQuery)별 분산 선택으로 상위 6(한 테마 쏠림 방지·각 테마 내부 배수 desc).
  const external_items = pickSpreadYoutube(
    gathered.filter((e) => e.source === "youtube"),
    6,
    FLOOR_SUBS,
  );

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
  // 검색 출처(YouTube) — 제안에 저장해 토글로 원문 확인(출처명시).
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
  //   + 타겟 먼저 모드: targetPersona 있으면 고정 타겟 지시 추가(없으면 바이트 동일 → promptHash 보존).
  const system = appendPersonaDirective(
    appendLevelDirective(appendLearnedInsights(TOPIC_SCOUT_SYSTEM, learned), !!opts?.levelSplit),
    opts?.targetPersona,
  );
  return { system, input, schema: TOPIC_SCOUT_SCHEMA, sources };
}
