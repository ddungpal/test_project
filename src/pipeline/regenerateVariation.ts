// 재생성(force) 변주 — '다시 생성'이 이전과 바이트 동일한 후보를 내는 버그 수정의 핵심(순수함수).
//   근본 원인: force여도 prepare가 같은 system+input을 만들면 promptHash 동일 → callLLM이 동일 후보 재생.
//   대응: run-in-place 경로에서만 base system에 '이전 안과 뚜렷이 다르게' 변주 지시를 결정적으로 덧붙여
//   promptHash를 차등화한다. forward(force=false) 경로는 절대 호출하지 않아 픽스처 해시가 보존된다.
//
// 결정적: 같은 (base, priors, attempt) → 항상 같은 출력. attempt(회차 nonce)가 다르면 출력이 달라
//   매 재생성마다 promptHash가 갱신된다(같은 안 반복 방지).

import type { Candidate } from "./stageContract.js";

const SUMMARY_MAX = 120; // 이전 안 요약 항목당 길이 상한(프롬프트 비대화 방지)

/** payload(unknown)에서 사람이 읽을 한 줄 요약을 방어적으로 추출. title 있으면 title, 아니면 JSON 축약. */
function summarizePayload(payload: unknown): string {
  let text: string;
  if (payload && typeof payload === "object" && "title" in payload) {
    const title = (payload as { title?: unknown }).title;
    text = typeof title === "string" && title.length > 0 ? title : JSON.stringify(payload);
  } else {
    text = JSON.stringify(payload);
  }
  // JSON.stringify(undefined)는 undefined를 반환할 수 있다 → 방어.
  if (typeof text !== "string") text = String(text);
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

/**
 * force 재생성 시 base system에 덧붙일 변주 지시(결정적·한국어).
 * - base가 비면 그대로 반환(방어).
 * - priors가 비면 회차 지시만 덧붙인다(이전 안 목록 생략).
 * - attempt가 다르면 출력 문자열이 달라진다(promptHash 차등 → 같은 안 재생 방지).
 */
export function buildRegenerateAugmentedSystem(
  baseSystem: string,
  priorCandidates: Pick<Candidate, "payload">[],
  attempt: number,
): string {
  if (!baseSystem) return baseSystem;

  const lines = [
    "",
    "",
    `## 다시 생성(${attempt}회차)`,
    "아래 이전 제안들과 '뚜렷이 다른' 새 안을 내라(주제 각도·표현·구조를 차별화). 이전 안 반복 금지:",
  ];
  for (const c of priorCandidates) {
    lines.push(`- ${summarizePayload(c.payload)}`);
  }
  return baseSystem + lines.join("\n");
}
