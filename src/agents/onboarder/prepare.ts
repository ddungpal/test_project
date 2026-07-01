// 쏙이(onboarder) 결정적 prep — 하이브리드 입력 조립(AI 없음·§8.1).
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "B. 입력 — 하이브리드".
//   (가) 레퍼런스 영상 자막(fetchTranscript) + (나) 영상이 쓴 숫자/사실 스니펫(videoFacts, 미검증).
//   ★ best-effort(throw 0): topic·영상·자막 부재 어느 것도 크래시시키지 않는다. topic이 없어도 {topic:""} 반환.
//   ★ 셜록/검증 파이프라인 절대 호출·신설 금지 — 이 시점 사실은 "영상 자체 주장"(미검증). 진짜 검증은 구다리 뒤 셜록 몫(시퀀싱).
//   ★ 레퍼런스 수집은 topic_scout/externalSignals.gatherExternalSignals를 재사용(재구현 금지). FLOOR_SUBS는 hook_maker에서 재사용.
//   ★ 조건부 주입(픽스처 보존): 값 없으면 키 자체를 넣지 않는다(undefined 필드 생략).
import type { Supa } from "../../pipeline/runState.js";
import { getSelectedStagePayload } from "../../pipeline/context.js";
import { gatherExternalSignals, rankExternalByMultiplier, type ExternalItem } from "../topic_scout/externalSignals.js";
import { FLOOR_SUBS } from "../hook_maker/externalRefs.js";
import { fetchTranscript } from "../../lib/onboarding/transcript.js";
import type { OnboarderInput } from "./schema.js";

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

/** youtube 소스 & viewCount 있는 레퍼런스 중 배수/조회수 상위 1개(rankExternalByMultiplier 재사용). 없으면 null(순수). */
export function pickTopReference(items: ExternalItem[]): ExternalItem | null {
  const eligible = items.filter((it) => it.source === "youtube" && it.viewCount != null);
  const top = rankExternalByMultiplier(eligible, 1, FLOOR_SUBS);
  return top[0] ?? null;
}

/** 주제 문자열로 레퍼런스 영상을 수집(gatherExternalSignals 재사용). best-effort — throw 전파 차단(gatherTitleReferences 패턴 미러). */
async function gatherReference(topic: string): Promise<ExternalItem | null> {
  if (!topic.trim()) return null;
  try {
    const items = await gatherExternalSignals({
      webQueries: [],
      ytQuery: topic,
      maxPerQuery: 8,
      volatility: "slow",
    });
    return pickTopReference(items);
  } catch (e) {
    console.warn(`[쏙이 prep] 레퍼런스 수집 실패(무시):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 쏙이 입력 조립 — 선택된 주제 + 레퍼런스 영상(자막·미검증 사실). best-effort(throw 0).
 *   - topic: getSelectedStagePayload("topic").title. 없으면 ""(크래시 금지 — 구다리와 달리 여기선 throw 안 함).
 *   - 레퍼런스 없으면 referenceTitle·transcript·videoFacts 모두 생략({topic}만으로도 유효).
 *   - (가) transcript: fetchTranscript(videoId), null이면 키 생략.
 *   - (나) videoFacts: buildVideoFacts(ref), 빈 배열이면 키 생략.
 */
export async function prepareOnboarder(supa: Supa, runId: string): Promise<OnboarderInput> {
  const topicPayload = (await getSelectedStagePayload(supa, runId, "topic")) as { title?: string } | null;
  const topic = topicPayload?.title ?? "";

  const input: OnboarderInput = { topic };

  const ref = await gatherReference(topic);
  if (!ref) return input; // 레퍼런스 없음 → topic만으로 유효.

  if (ref.title?.trim()) input.referenceTitle = ref.title.trim();

  // (가) 자막 — best-effort. URL에서 videoId 뽑아 취득(라이브러리는 URL도 받지만 명시 추출).
  const videoId = extractVideoId(ref.url);
  if (videoId) {
    const transcript = await fetchTranscript(videoId);
    if (transcript) input.transcript = transcript; // null이면 키 생략(설명+videoFacts 폴백).
  }

  // (나) 영상이 쓴 사실(미검증) — 메타에서만. 셜록 미호출.
  const videoFacts = buildVideoFacts(ref);
  if (videoFacts.length > 0) input.videoFacts = videoFacts;

  return input;
}
