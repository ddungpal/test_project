// Inngest 단계 함수 실패 캡처 — retries(2) 소진 후 1회 호출되는 onFailure 핸들러를 만든다.
//   비용캡(SoftCapPause/HardCap)은 runStageGuarded가 내부에서 삼키고 throw 안 하므로 여기 안 옴(정상).
//   여기로 오는 건 "예기치 못한 진짜 실패" → logs/errors.jsonl에 기록(휘발 방지).
//   onFailure는 실패 래퍼 이벤트를 받는다 — 원본 이벤트/runId는 event.data.event 아래에 있다.

interface FailurePayload {
  error: Error;
  event?: { data?: { event?: { name?: string; data?: { runId?: string } } } };
}

export function captureStageFailure(stage: string) {
  return async ({ error, event }: FailurePayload): Promise<void> => {
    const { captureError } = await import("../lib/observability/captureError.js");
    const orig = event?.data?.event;
    await captureError("inngest", error, { stage, runId: orig?.data?.runId, eventName: orig?.name });
  };
}
