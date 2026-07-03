// 쏙이(onboarder) 결정적 prep — 하이브리드 입력 조립(AI 없음·§8.1).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "B. 입력 — 하이브리드".
//   (가) 레퍼런스 영상 자막(fetchTranscript) + (나) 영상이 쓴 숫자/사실 스니펫(videoFacts, 미검증).
//   ★ best-effort(throw 0): topic·영상·자막 부재 어느 것도 크래시시키지 않는다. topic이 없어도 {topic:""} 반환.
//   ★ 셜록/검증 파이프라인 절대 호출·신설 금지 — 이 시점 사실은 "영상 자체 주장"(미검증). 진짜 검증은 구다리 뒤 셜록 몫(시퀀싱).
//   ★ 레퍼런스 수집은 topic_scout/externalSignals.gatherExternalSignals를 재사용(재구현 금지). 랭킹은 절대 조회수(rankExternalByViews).
//   ★ 조건부 주입(픽스처 보존): 값 없으면 키 자체를 넣지 않는다(undefined 필드 생략).
import type { Supa } from "../../pipeline/runState.js";
import { getSelectedStagePayload } from "../../pipeline/context.js";
import { gatherExternalSignals, rankExternalByViews, YouTubeQuotaError, type ExternalItem } from "../topic_scout/externalSignals.js";
import { fetchTranscript } from "../../lib/onboarding/transcript.js";
import type { OnboarderInput, OnboarderReference, ArcReference } from "./schema.js";

// 온보딩 재시도 가능 에러 — YouTube quota(429)/rate-limit 같은 일시적 인프라 실패 전용.
//   "레퍼런스 영상을 찾지 못해 온보딩 불가"(진짜 0개·영구 블록)와 구분해, UI가 "잠시 후 다시 시도" 안내로 표면화한다(step2).
export class OnboardingRetryableError extends Error {
  constructor(message = "유튜브 검색 한도 초과 — 잠시 후 다시 시도하세요") {
    super(message);
    this.name = "OnboardingRetryableError";
  }
}

/** 유튜브 watch URL(...watch?v=<id>) 또는 youtu.be 단축 URL에서 videoId 추출. 못 뽑으면 null(순수·throw 0). */
export function extractVideoId(url: string | undefined | null): string | null {
  if (!url) return null;
  const vParam = url.split("v=")[1];
  if (vParam) {
    const id = vParam.split("&")[0]?.trim();
    if (id) return id;
  }
  const shortMatch = /youtu\.be\/([^?&/]+)/.exec(url);
  if (shortMatch?.[1]) return shortMatch[1].trim();
  return null;
}

/** 레퍼런스 영상 메타(제목·설명 snippet·통계)에서 뽑은 가벼운 '영상 주장' 사실 스니펫 배열(순수·throw 0).
 *   ⚠️ 미검증 — 셜록 검증 아님. 쏙이 SYSTEM이 unverifiedNumbers/미검증으로 다룬다.
 *   - description snippet(있으면 앞부분)
 *   - 조회수/구독자/반응(공개된 통계만) — "영상이 얼마나 반응 얻었나"의 가벼운 맥락.
 *   값 없는 항목은 넣지 않는다(undefined 필드 생략 원칙과 정렬). 빈 배열 가능. */
export function buildVideoFacts(ref: ExternalItem): string[] {
  const facts: string[] = [];
  const snippet = ref.snippet?.trim();
  if (snippet) facts.push(`영상 설명: ${snippet.slice(0, 280)}`);
  if (ref.viewCount != null && Number.isFinite(ref.viewCount)) {
    facts.push(`조회수 ${ref.viewCount.toLocaleString("en-US")}회`);
  }
  if (ref.subscriberCount != null && Number.isFinite(ref.subscriberCount)) {
    facts.push(`채널 구독자 ${ref.subscriberCount.toLocaleString("en-US")}명`);
  }
  return facts;
}

/** youtube 소스 & viewCount 있는 레퍼런스 중 절대 조회수 상위 n개(rankExternalByViews 재사용). 순수(throw 0).
 *   eligible = youtube & viewCount != null. 근거 영상은 "많이 본 = 잘 전달됨" — 배수(발굴용)가 아니라 조회수 desc. */
export function pickTopReferences(items: ExternalItem[], n = 3): ExternalItem[] {
  const eligible = items.filter((it) => it.source === "youtube" && it.viewCount != null);
  return rankExternalByViews(eligible, n);
}

const REF_TARGET = 3; // 목표 레퍼런스 수.

// 검색 가치 없는 의문/강조 필러 — 핵심 명사 뒤에 붙어 검색을 뒤틀어 저성과/무관 영상을 부른다.
//   (라이브 측정: '대체'·'뭐길래' 추가 시 482만→9만→734). 조사는 제외(무해·단어 훼손 위험: '국가'→'국').
const REF_QUERY_FILLER = new Set([
  "대체","도대체","뭐길래","뭐길레","왜","진짜","정말","과연","그냥",
  "얼마나","어떻게","무엇","뭐","뭔데","이게","이거","이런","이렇게","도데체",
]);

/** 참조 검색용 쿼리 정제 — 주제 제목에서 핵심 키워드만 남긴다(주제 문장 통째는 API relevance가 낮아 0개 반환 위험). 순수·throw 0.
 *   1) 대괄호[..]·소괄호(..) 세그먼트([EP.65]·(사연편)) 제거. 2) 첫 절 경계(',' '|' 개행 + '?' '!') 앞 절만 유지.
 *   3) 앞뒤 따옴표·후행 문장부호(.…~)·잉여 공백 정리. 4) 의문/강조 필러(REF_QUERY_FILLER) 토큰 제거(정확 매치만).
 *   5) 앞 MAX_TOKENS(=3)개 토큰으로 제한(긴 제목 통째 → 0개 방지). 6) 결과가 2자 미만이면 원 제목(trim) 폴백.
 *   예: "커버드콜 ETF, 배당 진짜 나올까? [EP.65]" → "커버드콜 ETF".
 *       "커버드콜 ETF가 대체 뭐길래 배당을 10%씩 줄까? 초보를 위한 원리 완전 정복"
 *         → 물음표 경계 컷 + 필러('대체'·'뭐길래') 제거 + 앞 3토큰 → "커버드콜 ETF가 배당을"(482만 조회 영상 반환). */
export function refYouTubeQuery(topicTitle: string): string {
  const raw = (topicTitle ?? "").trim();
  let s = raw
    .replace(/\[[^\]]*\]/g, " ") // 대괄호 세그먼트 제거
    .replace(/\([^)]*\)/g, " "); // 소괄호 세그먼트 제거
  s = s.split(/[,|\n?!]/)[0] ?? s; // 첫 절 경계(콤마·파이프·개행·물음/느낌표) 앞 절만
  s = s.replace(/["'“”‘’]/g, " "); // 따옴표 제거
  s = s.replace(/[.…~]+$/g, ""); // 후행 문장부호 제거(?! 는 이미 절 경계로 컷됨)
  s = s.replace(/\s+/g, " ").trim(); // 잉여 공백 정리
  const MAX_TOKENS = 3; // ★ 4→3: 필러 제거 후 핵심 명사 위주로 더 짧게(저성과 쿼리 방지)
  // 의문/강조 필러 토큰 제거(★ 정확 토큰 매치만 — '배당을'의 '을' 같은 부분 문자열은 안 건드림).
  const tokens = s.split(" ").filter((t) => t && !REF_QUERY_FILLER.has(t));
  s = tokens.slice(0, MAX_TOKENS).join(" ");
  return s.length >= 2 ? s : raw; // 너무 짧으면 원 제목 폴백
}

/** 검색어 완화 — 정제 쿼리 q를 공백 기준 앞 절반(최소 1토큰) 핵심 키워드로 줄인다. 순수(throw 0). */
function relaxQuery(q: string): string {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return tokens.join(" ");
  const half = Math.max(1, Math.ceil(tokens.length / 2));
  return tokens.slice(0, half).join(" ");
}

/**
 * 주제 문자열로 레퍼런스 영상들을 수집(gatherExternalSignals 재사용) — 최대 REF_TARGET개.
 *   ★ 개별 수집(각 gather 호출) 실패는 try/catch로 삼킨다(best-effort). 최종 0개 판정·throw는 콜러(prepareOnboarder) 몫.
 *   ★ 근거 영상은 절대 조회수 랭킹(rankExternalByViews) — 배수(발굴용)가 아니다. FLOOR_SUBS 무관(하한 재랭킹 단계 없음).
 *   점진 완화(각 단계에서 REF_TARGET 채워지면 즉시 중단·quota 절약):
 *     0) 기본: q=refYouTubeQuery(topic)로 gather(q, 20) → pickTopReferences(items, 3)  [조회수 랭킹·viewCount 필터]
 *     (b) viewCount 필터 제거: youtube 전부(viewCount null 포함) rankExternalByViews 재랭킹 — 재검색 없음.
 *     (c) 검색어 완화: relaxQuery(q)로 재검색 → url dedup 병합 → rankExternalByViews.
 */
export async function gatherReferences(topic: string): Promise<ExternalItem[]> {
  if (!topic.trim()) return [];

  const q = refYouTubeQuery(topic); // ② 제목 → 핵심 키워드 정제.

  // 0) 기본 수집(정제 쿼리·풀 20).
  let items: ExternalItem[] = [];
  try {
    items = await gatherExternalSignals({
      webQueries: [],
      ytQuery: q,
      maxPerQuery: 20,
      volatility: "slow",
      throwOnYtQuota: true, // 온보더는 429를 삼키지 않는다 — "레퍼런스 없음" 오인 방지(콜러가 재시도 안내로 승격).
    });
  } catch (e) {
    // quota(429)는 일시적 인프라 실패 → 삼키지 말고 전파(빈 []로 폴백 금지). prepareOnboarder가 OnboardingRetryableError로 승격.
    if (e instanceof YouTubeQuotaError) throw e;
    console.warn(`[쏙이 prep] 레퍼런스 수집 실패(무시):`, e instanceof Error ? e.message : e);
    // items는 []로 유지 — 아래 완화 단계가 [] 위에서 도니 무해(재검색은 (c)에서).
  }

  let refs = pickTopReferences(items, REF_TARGET);
  if (refs.length >= REF_TARGET) return refs;

  // (b) viewCount 필터 제거 — youtube 전부(viewCount null 포함) 조회수 재랭킹(재검색 없음).
  const ytAll = items.filter((it) => it.source === "youtube");
  refs = rankExternalByViews(ytAll, REF_TARGET);
  if (refs.length >= REF_TARGET) return refs;

  // (c) 검색어 완화 — 재검색(quota 사용). 정제 쿼리 q와 완화어가 같으면(1토큰 등) 재검색 스킵.
  const relaxed = relaxQuery(q);
  if (relaxed && relaxed !== q) {
    try {
      const more = await gatherExternalSignals({
        webQueries: [],
        ytQuery: relaxed,
        maxPerQuery: 20,
        volatility: "slow",
        throwOnYtQuota: true, // 완화 재검색도 429는 전파 대상.
      });
      // url 기준 dedup(같은 영상이 원 검색·완화 검색 양쪽에 잡힐 수 있음 — 먼저 들어온 것 유지).
      const seen = new Set<string>();
      const merged: ExternalItem[] = [];
      for (const it of [...items, ...more]) {
        if (it.source !== "youtube") continue;
        if (it.url && seen.has(it.url)) continue;
        if (it.url) seen.add(it.url);
        merged.push(it);
      }
      refs = rankExternalByViews(merged, REF_TARGET);
    } catch (e) {
      // (c)는 이미 (0)에서 refs를 일부 모았을 수 있다 — quota여도 손에 든 refs가 있으면 그걸 반환(재시도 승격 대신).
      //   진짜 "0개인데 quota"일 때만 신호를 살려 전파(콜러가 재시도 안내로 승격).
      if (e instanceof YouTubeQuotaError && refs.length === 0) throw e;
      console.warn(`[쏙이 prep] 레퍼런스 완화 재수집 실패(무시):`, e instanceof Error ? e.message : e);
    }
  }

  return refs; // 최종 refs(0~3개) — 0개 판정은 콜러가.
}

/**
 * 쏙이 입력 조립 — 선택된 주제 + 레퍼런스 영상들(최대 3개·자막·미검증 사실).
 *   - topic: getSelectedStagePayload("topic").title. 없으면 ""(크래시 금지 — 구다리와 달리 여기선 throw 안 함).
 *   ★ topic 빈 문자열이면 수집 시도 없이 { topic:"", references:[] } 반환(best-effort — throw 안 함·gather 호출 0).
 *   ★ topic이 있는데 최종 refs가 0개면 throw("...온보딩 불가") — topic-only 폴백 금지(설계 A+B, refs ≥1 강제).
 *   각 ref: extractVideoId(url) 없으면 스킵. (가) transcript=fetchTranscript(videoId) null이면 키 생략(자막 fetch도 best-effort).
 *           (나) videoFacts=buildVideoFacts(ref) 빈배열이면 키 생략.
 */
export async function prepareOnboarder(supa: Supa, runId: string): Promise<OnboarderInput> {
  const topicPayload = (await getSelectedStagePayload(supa, runId, "topic")) as { title?: string } | null;
  const topic = topicPayload?.title ?? "";

  // topic 없으면 best-effort — 수집 시도 없이 빈 references(throw 안 함).
  if (!topic.trim()) return { topic, references: [] };

  let items: ExternalItem[];
  try {
    items = await gatherReferences(topic);
  } catch (e) {
    // quota(429)는 재시도 가능 — 영구 "온보딩 불가"와 분리해 승격. 그 외 에러는 원형 그대로 전파.
    if (e instanceof YouTubeQuotaError) throw new OnboardingRetryableError();
    throw e;
  }
  if (items.length === 0) {
    // topic은 있는데 레퍼런스 0개(비-quota) → 영구 블록(설계 A+B: refs 없이 아크 생성 안 함).
    throw new Error("레퍼런스 영상을 찾지 못해 온보딩 불가");
  }

  const references: OnboarderReference[] = [];
  for (const item of items) {
    const videoId = extractVideoId(item.url);
    if (!videoId) continue; // videoId 못 뽑으면 그 ref 스킵.

    const ref: OnboarderReference = {
      title: item.title?.trim() ?? "",
      url: item.url,
      videoId,
      viewCount: item.viewCount,
      subscriberCount: item.subscriberCount,
    };

    // (가) 자막 — best-effort(개별 실패 무시). URL에서 뽑은 videoId로 취득.
    try {
      const transcript = await fetchTranscript(videoId);
      if (transcript) ref.transcript = transcript; // null이면 키 생략(설명+videoFacts 폴백).
    } catch (e) {
      console.warn(`[쏙이 prep] 자막 취득 실패(무시) videoId=${videoId}:`, e instanceof Error ? e.message : e);
    }

    // (나) 영상이 쓴 사실(미검증) — 메타에서만. 셜록 미호출.
    const videoFacts = buildVideoFacts(item);
    if (videoFacts.length > 0) ref.videoFacts = videoFacts;

    references.push(ref);
  }

  // videoId를 하나도 못 뽑아 references가 비면 그것도 0개 → 블록(refs ≥1 강제).
  if (references.length === 0) {
    throw new Error("레퍼런스 영상을 찾지 못해 온보딩 불가");
  }

  return { topic, references };
}

/**
 * 추가 문항 생성용 입력 조립 — 저장된 아크 refs를 재사용(재검색 없음·quota 0).
 *   ★ gatherExternalSignals(검색) 절대 호출 금지 — storedRefs를 그대로 순회한다.
 *   - topic: getSelectedStagePayload("topic").title. 없으면 ""(크래시 금지·prepareOnboarder 미러).
 *   - 각 storedRef: videoId 없으면 스킵. { title, url, videoId } + 자막(fetchTranscript best-effort·null이면 키 생략).
 *     videoFacts는 아크 payload에 저장 안 됐으니(경량 refs) 생략한다.
 *   - storedRefs가 []여도 { topic, references:[] } 반환(구버전 아크 하위호환·throw 0).
 */
export async function prepareOnboarderFromRefs(
  supa: Supa,
  runId: string,
  storedRefs: ArcReference[],
): Promise<OnboarderInput> {
  const topicPayload = (await getSelectedStagePayload(supa, runId, "topic")) as { title?: string } | null;
  const topic = topicPayload?.title ?? "";

  const references: OnboarderReference[] = [];
  for (const stored of storedRefs) {
    const videoId = stored?.videoId?.trim();
    if (!videoId) continue; // videoId 없으면 그 ref 스킵.

    const ref: OnboarderReference = { title: stored.title?.trim() ?? "", url: stored.url, videoId };

    // 자막 — best-effort(개별 실패 무시). videoFacts는 저장 안 됐으니 생략.
    try {
      const transcript = await fetchTranscript(videoId);
      if (transcript) ref.transcript = transcript; // null이면 키 생략.
    } catch (e) {
      console.warn(`[쏙이 prep] 저장 refs 자막 취득 실패(무시) videoId=${videoId}:`, e instanceof Error ? e.message : e);
    }

    references.push(ref);
  }

  return { topic, references };
}
