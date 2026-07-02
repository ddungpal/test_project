// 쏙이(onboarder) 결정적 prep — 하이브리드 입력 조립(AI 없음·§8.1).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "B. 입력 — 하이브리드".
//   (가) 레퍼런스 영상 자막(fetchTranscript) + (나) 영상이 쓴 숫자/사실 스니펫(videoFacts, 미검증).
//   ★ best-effort(throw 0): topic·영상·자막 부재 어느 것도 크래시시키지 않는다. topic이 없어도 {topic:""} 반환.
//   ★ 셜록/검증 파이프라인 절대 호출·신설 금지 — 이 시점 사실은 "영상 자체 주장"(미검증). 진짜 검증은 구다리 뒤 셜록 몫(시퀀싱).
//   ★ 레퍼런스 수집은 topic_scout/externalSignals.gatherExternalSignals를 재사용(재구현 금지). FLOOR_SUBS는 hook_maker에서 재사용.
//   ★ 조건부 주입(픽스처 보존): 값 없으면 키 자체를 넣지 않는다(undefined 필드 생략).
import type { Supa } from "../../pipeline/runState.js";
import { getSelectedStagePayload } from "../../pipeline/context.js";
import { gatherExternalSignals, rankExternalByMultiplier, YouTubeQuotaError, type ExternalItem } from "../topic_scout/externalSignals.js";
import { FLOOR_SUBS } from "../hook_maker/externalRefs.js";
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

/** youtube 소스 & viewCount 있는 레퍼런스 중 배수/조회수 상위 n개(rankExternalByMultiplier 재사용). 순수(throw 0).
 *   기존 pickTopReference(단일) 필터 로직 계승 — eligible = youtube & viewCount != null. FLOOR_SUBS 하한 적용. */
export function pickTopReferences(items: ExternalItem[], n = 3): ExternalItem[] {
  const eligible = items.filter((it) => it.source === "youtube" && it.viewCount != null);
  return rankExternalByMultiplier(eligible, n, FLOOR_SUBS);
}

const REF_TARGET = 3; // 목표 레퍼런스 수.

/** 검색어 완화 — topic을 공백 기준 앞 절반(최소 1토큰) 핵심 키워드로 줄인다. 순수(throw 0). */
function relaxQuery(topic: string): string {
  const tokens = topic.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return tokens.join(" ");
  const half = Math.max(1, Math.ceil(tokens.length / 2));
  return tokens.slice(0, half).join(" ");
}

/**
 * 주제 문자열로 레퍼런스 영상들을 수집(gatherExternalSignals 재사용) — 최대 REF_TARGET개.
 *   ★ 개별 수집(각 gather 호출) 실패는 try/catch로 삼킨다(best-effort). 최종 0개 판정·throw는 콜러(prepareOnboarder) 몫.
 *   점진 완화(각 단계에서 REF_TARGET 채워지면 즉시 중단·quota 절약):
 *     0) 기본: gather(topic, 10) → pickTopReferences(items, 3)  [FLOOR_SUBS·viewCount 필터]
 *     (a) FLOOR_SUBS 하한 제거: 이미 모은 items 재랭킹(rankExternalByMultiplier floorSubs=0) — 재검색 없음.
 *     (b) viewCount 필터 제거: eligible = youtube 전부(viewCount null 포함) 재랭킹 — 재검색 없음.
 *     (c) 검색어 완화: relaxQuery(topic)로 재검색 → viewCount 필터만(floorSubs=0)로 랭킹.
 */
export async function gatherReferences(topic: string): Promise<ExternalItem[]> {
  if (!topic.trim()) return [];

  // 0) 기본 수집.
  let items: ExternalItem[] = [];
  try {
    items = await gatherExternalSignals({
      webQueries: [],
      ytQuery: topic,
      maxPerQuery: 10,
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

  // (a) FLOOR_SUBS 하한 제거 — 이미 모은 items 재랭킹(재검색 없음).
  const ytWithViews = items.filter((it) => it.source === "youtube" && it.viewCount != null);
  refs = rankExternalByMultiplier(ytWithViews, REF_TARGET, 0);
  if (refs.length >= REF_TARGET) return refs;

  // (b) viewCount 필터 제거 — youtube 전부(viewCount null 포함) 재랭킹(재검색 없음).
  const ytAll = items.filter((it) => it.source === "youtube");
  refs = rankExternalByMultiplier(ytAll, REF_TARGET, 0);
  if (refs.length >= REF_TARGET) return refs;

  // (c) 검색어 완화 — 재검색(quota 사용). 원래 topic과 완화어가 같으면(1토큰 등) 재검색 스킵.
  const relaxed = relaxQuery(topic);
  if (relaxed && relaxed !== topic.trim()) {
    try {
      const more = await gatherExternalSignals({
        webQueries: [],
        ytQuery: relaxed,
        maxPerQuery: 10,
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
      refs = rankExternalByMultiplier(merged, REF_TARGET, 0);
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

    const ref: OnboarderReference = { title: item.title?.trim() ?? "", url: item.url, videoId };

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
