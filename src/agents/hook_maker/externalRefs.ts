// 훅이 제목 레퍼런스 — '조회수 높은 관련 유튜브 제목'을 수집·추림(코드 전용·LLM 0회).
//   ★ 옵트인 게이트: TITLE_REFERENCES==="youtube" 일 때만 실수집(pickYtBackend 패턴 미러). 그 외 [].
//   ★ topic_scout/externalSignals.gatherExternalSignals를 그대로 재사용(import만, 수정 금지).
//   ★ 게이트 헬퍼는 여기에 둔다(hook_maker 단일 범위 — config.ts 신설 안 함).
import { gatherExternalSignals, type ExternalItem } from "../topic_scout/externalSignals.js";

export interface ExternalTitleRef {
  id: string;
  title: string;
  viewCount: number;
  url: string;
  publisher: string | null;
}

/** youtube 소스 & viewCount!=null 만 → 조회수 내림차순(동률은 id로 안정 정렬) → 제목 중복 제거 → 상위 n.
 *  순수함수(네트워크·DB 없음)·결정적. 빈 입력 → []. */
export function pickTopExternalTitles(items: ExternalItem[], n: number): ExternalTitleRef[] {
  const eligible: { id: string; title: string; viewCount: number; url: string; publisher: string | null }[] = [];
  for (const it of items) {
    if (it.source !== "youtube") continue;
    if (it.viewCount == null) continue;
    eligible.push({ id: it.id, title: it.title, viewCount: it.viewCount, url: it.url, publisher: it.publisher });
  }
  // 조회수 desc, 동률은 id asc(안정·결정적).
  eligible.sort((a, b) => (b.viewCount - a.viewCount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

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
