// 쏙이(onboarder) 입력 (가) — 레퍼런스 영상 자막 best-effort 취득.
//   설계: docs/specs/2026-07-01-onboarding-tutor-ssoki-design.md "B. 입력 — 하이브리드".
//   ★ best-effort(throw 0): 네트워크 실패·자막 없음·비공개·비디오 불가는 전부 null.
//     자막 실패가 온보딩 전체를 막으면 안 된다(externalSignals.fetchVideoStats best-effort 패턴 미러).
//   ★ 키 불필요: youtube-transcript(timedtext/InnerTube 스크래핑) — API 키·env 무영향.
//     이미 package.json에 ^1.3.1로 핀돼 있고 scripts/ingest-youtube.ts가 쓰는 라이브러리를 재사용(신규 의존성 0).
//   ★ ponytail: 자막 품질/커버리지가 더 필요해지면 공식 captions API(OAuth)로 업그레이드 — 보류(설계 "보류").
import { YoutubeTranscript } from "youtube-transcript";

// 자막 세그먼트 결합 시 상한(토큰·비용 방어). 프롬프트에 통째로 안 넣고 이 길이로 컷.
const MAX_TRANSCRIPT_CHARS = 8000;

/**
 * videoId(또는 유튜브 URL)로 자막 텍스트를 best-effort 취득. 실패·없음·비공개 → null (throw 금지).
 *   - ko → en → 기본(언어 미지정) 순으로 시도(한국어 우선, 없으면 폴백).
 *   - YoutubeTranscript.fetchTranscript는 videoId·URL 둘 다 받는다(라이브러리 retrieveVideoId 내장).
 *   - 어느 예외(자막 비활성·비공개·429·네트워크)도 삼키고 다음 언어 시도, 전부 실패면 null.
 */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  const id = videoId.trim();
  if (!id) return null;

  for (const lang of ["ko", "en", undefined] as const) {
    try {
      const items = await YoutubeTranscript.fetchTranscript(id, lang ? { lang } : undefined);
      if (items && items.length) {
        const text = items
          .map((i) => i.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) return text.slice(0, MAX_TRANSCRIPT_CHARS);
      }
    } catch {
      // best-effort: 이 언어 실패는 무시하고 다음 언어 시도(throw 전파 금지).
    }
  }
  return null;
}
