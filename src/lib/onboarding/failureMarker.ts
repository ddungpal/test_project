// 온보딩 재시도 실패 마커 — 순수 헬퍼(무거운 import 금지·throw 0).
//   quota(429) 실패로 아크 생성이 안 될 때, 클라가 "아크"를 읽는 것과 같은 경로(stage_proposals)로
//   읽을 경량 실패 신호. 마커 payload는 아크와 모양이 달라(readRetryFailureMessage로 판별) 서로 오인하지 않는다.
//   설계: docs/specs/2026-07-03-onboarding-quota-resilience-design.md "#1 — onboardingStage/UI 표면화".
//   ★ 이 파일은 어떤 무거운 모듈도 import 하지 않는다(vitest @/ alias 함정 회피·순수 유닛테스트 대상).

const DEFAULT_RETRY_MESSAGE = "유튜브 검색 한도 초과 — 잠시 후 다시 시도하세요";

/** stage_proposals candidates[0].payload에 저장할 재시도 실패 마커. 아크와 구분되는 고유 형태. */
export function buildRetryFailureMarker(message: string): { retryable_failure: true; message: string } {
  return { retryable_failure: true, message };
}

/** payload가 재시도 실패 마커면 그 message(문자열 아니면 기본 안내)를 반환, 아니면 null(순수·throw 0).
 *   아크 모양 payload({questions:[...]} 등)는 retryable_failure가 없어 null → 아크로 정상 처리된다. */
export function readRetryFailureMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const marker = payload as { retryable_failure?: unknown; message?: unknown };
  if (marker.retryable_failure !== true) return null;
  return typeof marker.message === "string" && marker.message.trim() ? marker.message : DEFAULT_RETRY_MESSAGE;
}

/** 재시도 마커를 저장해야 하는 에러인지 — name 기반이라 prepare.ts(무거움)를 import하지 않는다(순수). */
export function isRetryMarkerError(err: unknown): boolean {
  return err instanceof Error && err.name === "OnboardingRetryableError";
}
