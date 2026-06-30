// 훅이 제목 레퍼런스 — '조회수 높은 관련 유튜브 제목'을 수집·추림(코드 전용·LLM 0회).
//   ★ 옵트인 게이트: TITLE_REFERENCES==="youtube" 일 때만 실수집(pickYtBackend 패턴 미러). 그 외 [].
//   ★ topic_scout/externalSignals.gatherExternalSignals를 그대로 재사용(import만, 수정 금지).
//   ★ 게이트 헬퍼는 여기에 둔다(hook_maker 단일 범위 — config.ts 신설 안 함).
import { gatherExternalSignals, viewsPerSubscriber, type ExternalItem } from "../topic_scout/externalSignals.js";

// 구독자 노이즈 바닥 — 이 미만 채널은 배수 과장(예: 구독 10명·조회 1만=1000배) → 배수 null 처리해 랭킹에서 후순위로.
//   discovery.ts도 이 상수를 import해 공유한다(드리프트 방지 — 단일 출처).
export const FLOOR_SUBS = 1000;

export interface ExternalTitleRef {
  id: string;
  title: string;
  viewCount: number;
  url: string;
  publisher: string | null;
  multiplier: number | null; // 구독자 대비 조회수 배수(아웃라이어). null=비공개·노이즈 컷·FLOOR_SUBS 미만.
  subscriberCount: number | null;
}

/** youtube 소스 & viewCount!=null 만 → 배수(구독 대비 조회수) 내림차순(아웃라이어 우선) → 제목 중복 제거 → 상위 n.
 *  정렬 우선순위: 배수 desc(null은 뒤) → null끼리는 조회수 desc → 최종 동률 id asc(결정적).
 *  순수함수(네트워크·DB 없음)·결정적. 빈 입력 → []. */
export function pickTopExternalTitles(items: ExternalItem[], n: number): ExternalTitleRef[] {
  const eligible: ExternalTitleRef[] = [];
  for (const it of items) {
    if (it.source !== "youtube") continue;
    if (it.viewCount == null) continue;
    eligible.push({
      id: it.id,
      title: it.title,
      viewCount: it.viewCount,
      url: it.url,
      publisher: it.publisher,
      multiplier: viewsPerSubscriber(it.viewCount, it.subscriberCount, FLOOR_SUBS),
      subscriberCount: it.subscriberCount,
    });
  }
  // 1순위 배수 desc(아웃라이어 우선, null은 뒤) → 배수 동률/둘다 null이면 조회수 desc → 동률 id asc.
  eligible.sort((a, b) => {
    if (a.multiplier == null && b.multiplier == null) {
      // 둘 다 배수 없음 → 기존처럼 조회수 보조 정렬.
    } else if (a.multiplier == null) {
      return 1; // null은 뒤로
    } else if (b.multiplier == null) {
      return -1;
    } else if (a.multiplier !== b.multiplier) {
      return b.multiplier - a.multiplier;
    }
    return (b.viewCount - a.viewCount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  const seenTitles = new Set<string>();
  const out: ExternalTitleRef[] = [];
  for (const e of eligible) {
    if (seenTitles.has(e.title)) continue;
    seenTitles.add(e.title);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

/** 옵트인 게이트 — TITLE_REFERENCES==="youtube" 일 때만 외부 제목 수집(pickYtBackend 미러). */
export function titleReferencesEnabled(): boolean {
  return process.env.TITLE_REFERENCES === "youtube";
}

/** 주제 문자열로 고조회 관련 유튜브 제목을 수집·추림. 게이트 off면 즉시 [](네트워크 0·$0).
 *  gatherExternalSignals는 best-effort지만 방어적으로 try/catch — throw 전파 막아 prepare 안전. */
export async function gatherTitleReferences(topic: string): Promise<ExternalTitleRef[]> {
  if (!titleReferencesEnabled()) return [];
  try {
    const items = await gatherExternalSignals({
      webQueries: [topic],
      ytQuery: topic,
      maxPerQuery: 8,
      volatility: "slow",
    });
    return pickTopExternalTitles(items, 5);
  } catch (e) {
    console.warn(`[훅이 제목레퍼런스] 외부 수집 실패(무시):`, e instanceof Error ? e.message : e);
    return [];
  }
}

// ── 썸네일 아웃라이어 레퍼런스 (step2: thumbnail-outlier-gather) ──
//   구독자 대비 조회수가 터진 외부 영상의 '썸네일 이미지'를 김짠부 시각 레퍼런스로 모은다.
//   ★ 이미지/URL은 UI 표시 전용 — 썸네일메이커 LLM 입력에 절대 안 들어간다(텍스트 LLM은 이미지 못 씀·promptHash 불변).

// 김짠부 자기 채널 식별자 — 외부 레퍼런스에서 자기 영상은 뺀다(자기 썸네일은 레퍼런스 아님).
//   확실한 핸들/채널명: 핸들 @zzanboo, 채널명 "김짠부"(ingest-channel-titles.ts·.env.example 기준).
//   채널ID(UC…)는 미확정이므로 publisher(channelTitle) 문자열 포함 여부의 가벼운 휴리스틱으로만 거른다.
const KIMZZANBU_CHANNEL = ["김짠부", "zzanboo"];

function isOwnChannel(publisher: string | null): boolean {
  if (!publisher) return false;
  const p = publisher.toLowerCase();
  return KIMZZANBU_CHANNEL.some((name) => p.includes(name.toLowerCase()));
}

export interface OutlierThumbnailRef {
  id: string; // url 기반 안정 id(ExternalItem.id 그대로)
  title: string;
  thumbnailUrl: string; // 외부 영상 썸네일 이미지(표시용·non-null만)
  url: string;
  publisher: string | null; // 채널명
  viewCount: number;
  subscriberCount: number | null;
  multiplier: number | null; // viewsPerSubscriber
}

/** youtube 소스 & thumbnailUrl!=null & viewCount!=null & 자기채널 아님만 → 배수(구독 대비 조회수) 내림차순 →
 *  url 중복 제거 → 상위 n. 정렬은 pickTopExternalTitles와 동일 결정성:
 *  배수 desc(null은 뒤) → null끼리는 조회수 desc → 최종 동률 id asc.
 *  순수함수(네트워크·DB 없음)·결정적. 빈 입력 → []. */
export function pickTopOutlierThumbnails(items: ExternalItem[], n: number): OutlierThumbnailRef[] {
  const eligible: OutlierThumbnailRef[] = [];
  for (const it of items) {
    if (it.source !== "youtube") continue;
    if (it.thumbnailUrl == null) continue;
    if (it.viewCount == null) continue;
    if (isOwnChannel(it.publisher)) continue; // 김짠부 자기 영상 제외
    eligible.push({
      id: it.id,
      title: it.title,
      thumbnailUrl: it.thumbnailUrl,
      url: it.url,
      publisher: it.publisher,
      viewCount: it.viewCount,
      subscriberCount: it.subscriberCount,
      multiplier: viewsPerSubscriber(it.viewCount, it.subscriberCount, FLOOR_SUBS),
    });
  }
  // pickTopExternalTitles와 동일 정렬: 배수 desc(null 뒤) → 둘다 null이면 조회수 desc → 동률 id asc.
  eligible.sort((a, b) => {
    if (a.multiplier == null && b.multiplier == null) {
      // 둘 다 배수 없음 → 조회수 보조 정렬.
    } else if (a.multiplier == null) {
      return 1;
    } else if (b.multiplier == null) {
      return -1;
    } else if (a.multiplier !== b.multiplier) {
      return b.multiplier - a.multiplier;
    }
    return (b.viewCount - a.viewCount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  const seenUrls = new Set<string>();
  const out: OutlierThumbnailRef[] = [];
  for (const e of eligible) {
    if (seenUrls.has(e.url)) continue;
    seenUrls.add(e.url);
    out.push(e);
    if (out.length >= n) break;
  }
  return out;
}

/** 주제 문자열로 아웃라이어 영상 썸네일을 수집·추림. 게이트 off면 즉시 [](네트워크 0·$0).
 *  gatherTitleReferences 패턴 미러 — best-effort try/catch로 throw 전파 막음. 게이트는 titleReferencesEnabled 재사용. */
export async function gatherOutlierThumbnails(topic: string, n: number): Promise<OutlierThumbnailRef[]> {
  if (!titleReferencesEnabled()) return [];
  try {
    const items = await gatherExternalSignals({
      webQueries: [topic],
      ytQuery: topic,
      maxPerQuery: 8,
      volatility: "slow",
    });
    return pickTopOutlierThumbnails(items, n);
  } catch (e) {
    console.warn(`[훅이 썸네일레퍼런스] 외부 수집 실패(무시):`, e instanceof Error ? e.message : e);
    return [];
  }
}
